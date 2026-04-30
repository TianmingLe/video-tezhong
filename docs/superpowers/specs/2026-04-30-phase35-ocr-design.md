# Phase 3.5：OCR 画面文字提取（集成 PaddleOCR）设计文档

## 1. 概述

### 1.1 目标

在现有 ASR（转写）+ 评论分析（comment-depth=1/2）基础上，新增“视频画面文字提取（OCR）”能力，形成三重输入：

- 口播：ASR transcript
- 社区：结构化评论（comment_value_judge / community_insights）
- 画面：OCR text（带时间戳的文字流）

并将 OCR 输出接入 LLM 分析（knowledge_extract + 报告生成），增强分析覆盖面（字幕教程/PPT讲解/无声视频等）。

### 1.2 约束

- 向后兼容：默认不开启 OCR（`--ocr-enabled false`），不影响现有输出
- 性能优先：OCR 与 ASR 并行；OCR 默认 CPU 模式
- 工程稳健：OCR 失败/超时仅 warning，不中断主流程
- 输入控量：OCR 文本总量在进入 LLM 前截断到约 `<= 2000 tokens`（字符预算近似）
- 缓存：同一视频的 OCR 结果缓存到 `data/douyin/ocr_cache/`，支持断点续跑复用

### 1.3 依赖策略（默认建议）

PaddleOCR 体积较大，采取“可选依赖”策略：

- 未安装 PaddleOCR 时：输出 `[WARN]` 并跳过 OCR（主流程继续）
- 安装后自动启用（当用户指定 `--ocr-enabled true`）

---

## 2. CLI 参数与配置

### 2.1 新增 CLI 参数（cmd_arg/arg.py）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--ocr-enabled` | false | 是否启用 OCR |
| `--ocr-interval` | 5 | 每隔 N 秒抽取 1 帧进行 OCR |
| `--ocr-model` | `ppocr_v4` | OCR 模型标识（写入缓存 meta，后续可扩展） |
| `--ocr-use-gpu` | false | 可选：启用 GPU（默认 CPU，避免与 ASR 冲突） |

### 2.2 新增 base_config（config/base_config.py）

| 配置项 | 默认值 | 说明 |
|------|--------|------|
| `OCR_ENABLED` | False | 对应 `--ocr-enabled` |
| `OCR_INTERVAL_SEC` | 5 | 对应 `--ocr-interval` |
| `OCR_MODEL` | `ppocr_v4` | 对应 `--ocr-model` |
| `OCR_USE_GPU` | False | 对应 `--ocr-use-gpu` |
| `OCR_TIMEOUT_SECONDS` | 120 | OCR 总超时 |

---

## 3. OCR 服务封装（services/ocr_service.py）

### 3.1 API

新增 `OCRService`：

`extract_text_from_video(video_path, interval_sec=5) -> List[TextBlock]`

TextBlock 结构：

```json
{
  "text": "识别到的文字",
  "confidence": 0.95,
  "timestamp": "00:01:23",
  "bbox": [x1, y1, x2, y2],
  "frame_index": 45
}
```

### 3.2 关键帧策略

默认策略：按时间间隔抽帧（每 `interval_sec` 秒取一帧）。

实现建议：

- 使用 `cv2.VideoCapture` 读取视频 fps / frame_count
- 计算目标帧序号：`frame_index = round(t * fps)`
- `cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)` 定位后 `cap.read()`

可选增强（后续）：场景变化检测（例如基于相邻帧直方图差异/SSIM），作为“补抽帧”的增量策略。

### 3.3 PaddleOCR 接入（可选依赖）

运行时导入：

- `from paddleocr import PaddleOCR`

初始化参数（默认 CPU）：

- `use_angle_cls=True`
- `lang="ch"`
- `use_gpu=config.OCR_USE_GPU`

失败降级：

- PaddleOCR 未安装 / 模型下载失败 / 推理异常 → 抛出受控异常给上层并记录 warning

---

## 4. OCR 文本后处理（services/ocr_postprocessor.py）

### 4.1 输入

- `List[TextBlock]`（原始 OCR blocks）

### 4.2 输出

1) 供 LLM 使用的 `ocr_text: str`（与 transcript 兼容）：

- 推荐格式（带时间戳）：

```
[00:00:05] 文字...
[00:00:10] 文字...
```

2) `ocr_summary`（供 mvp_analysis/report/kb 聚合）：

```json
{
  "total_blocks": 47,
  "key_texts": ["PPT标题", "关键数据", "字幕重点"],
  "source_distribution": {"subtitle": 30, "ppt": 12, "cover": 5}
}
```

### 4.3 去重/合并规则

- 连续帧相同/相似文字合并：
  - 文本相似度 > 0.9（可用 `difflib.SequenceMatcher` 近似）
  - bbox 位置接近（中心点距离阈值）
- 合并后保留：
  - 最高置信度/或最早 timestamp 作为代表

### 4.4 排序与截断

- 按 timestamp 升序输出连贯文字流
- token 控制（近似字符预算）：在输出前控制总长度 `<= 2000 tokens`（例如 8000~10000 字符预算）
- 截断策略：
  - 先减少低置信度 blocks
  - 再减少重复率高的 blocks
  - 最后截断单条 text 最大长度

---

## 5. 缓存机制（data/douyin/ocr_cache）

### 5.1 缓存文件

- `data/douyin/ocr_cache/<aweme_id>.json`

内容包含：

```json
{
  "aweme_id": "xxx",
  "video_path": "...",
  "created_at": "...",
  "interval_sec": 5,
  "model": "ppocr_v4",
  "blocks": [ ...TextBlock... ],
  "postprocess": {
    "ocr_text": "...",
    "ocr_summary": {...}
  }
}
```

### 5.2 复用规则

- 若缓存存在且 meta（interval/model）与本次参数一致：直接复用
- 若不一致：重算并覆盖（或未来扩展为多版本缓存）

---

## 6. 并行与降级（关键性能点）

### 6.1 并行执行

在视频下载完成后：

- ASR 与 OCR 并行启动
  - ASR：现有 `ASRService.transcribe(...)`
  - OCR：`OCRService.extract_text_from_video(...)` + `OCRPostprocessor`

建议实现方式：

- OCR 属于 CPU bound + 外部库调用：用 `asyncio.to_thread(...)` 包一层
- `asyncio.gather(asr_task, ocr_task)`

### 6.2 超时与失败降级

- OCR 总超时：`asyncio.wait_for(..., timeout=120)`
- 超时/异常：`[WARN]` 并将 `ocr_text=None`、`ocr_summary=None`，主流程继续（只用 ASR+评论）

---

## 7. LLMAnalyzer 增强（services/llm_analyzer.py）

### 7.1 analyze() 参数

将 `ocr_text` 改为 `Optional[str]`（向后兼容：None 视为空）：

- `analyze(..., transcript: str, comments: Optional[dict], ocr_text: Optional[str])`

### 7.2 Prompt 更新（config/prompts.yaml）

`knowledge_extract` 输入扩展：

- transcript + ocr_text + valuable_comments_json

并要求知识点标注来源：

- `source` 字段：`#口播/#画面/#评论`
- 向后兼容：即使 LLM 未输出 source，也不影响渲染（source 可选）

---

## 8. 输出增强

### 8.1 mvp_output.json

新增字段：

- `ocr_text`（可选）
- `ocr_summary`（可选）

### 8.2 mvp_analysis.json

新增字段：

- `ocr_summary`（同上，或来自 pipeline 透传）

### 8.3 mvp_report.md

新增章节：

- `## 🔤 画面文字要点`：展示 `ocr_summary.key_texts` 与 OCR 文字流摘要

### 8.4 kb_summary.md / kb_index.jsonl

- `kb_index.jsonl` 新增 `ocr_summary` 或 `ocr_key_texts` 摘要字段
- `kb_summary.md` 聚合时，新增“画面文字（跨视频）”汇总段（规则去重即可）

---

## 9. 验收标准

### 9.1 命令（detail + OCR 启用）

```bash
python main.py --platform dy --pipeline mvp --specified_id <视频ID> \
  --ocr-enabled true --ocr-interval 5 \
  --comment-depth 2 --enable-llm true --llm-model "gpt-4o"
```

### 9.2 输出文件

- `results/mvp_analysis.json` 新增 `ocr_summary`
- `results/mvp_report.md` 新增 `## 🔤 画面文字要点`
- `data/douyin/ocr_cache/<aweme_id>.json` 存在并可复用

### 9.3 日志

必须出现类似：

```
[INFO] OCR启用: interval=5s, model=ppocr_v4
[INFO] 抽取关键帧: 12帧 (视频时长60s)
[INFO] OCR识别: 47个文本块, 置信度>=0.6: 42个
[INFO] 后处理: 去重后保留28个关键文本块
[SUCCESS] OCR完成, 纳入LLM分析
```

### 9.4 错误处理

- PaddleOCR 未安装/模型下载失败：`[WARN]` 跳过 OCR
- 帧提取失败：`[WARN]` 尝试降低抽帧密度后重试（可选），仍失败则跳过
- OCR 总超时 >120s：`[WARN]` 跳过 OCR，继续 ASR+评论分析

