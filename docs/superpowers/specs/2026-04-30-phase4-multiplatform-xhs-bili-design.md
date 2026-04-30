# Phase 4：多平台扩展（小红书 xhs + 哔哩哔哩 bili）设计文档

## 1. 概述

### 1.1 目标

在现有抖音（dy）MVP + OCR + 评论 + LLM + KB 流水线基础上，实现多平台扩展：

- `--platform` 支持 `dy|xhs|bili`
- xhs + bili 均支持：
  - detail（`--specified_id`）
  - search（`--type search --keywords ... --limit ...`）
- 复用统一的分析流水线：OCR / CommentProcessor / LLMAnalyzer / Report / KnowledgeBase
- 平台差异通过“轻量平台适配器 + 插件化工厂”隔离，核心流水线尽量不动
- 缓存与落盘路径按平台隔离：`data/<platform>/...`，避免冲突

### 1.2 决策（已确认）

- 架构方案：采用方案 B（轻量平台适配器 + 插件化），核心流水线不推倒重写
- 验收范围：全量（xhs + bili 都支持 detail + search）
- Cookie 管理：新增 `--xhs-cookie` 参数，并预留 `--dy-cookie/--bili-cookie` 的扩展接口（本期不强制接入）

---

## 2. 现状与约束（基于代码库）

### 2.1 现有 crawler 已具备多平台能力

代码库已存在并可创建：

- xhs：`XiaoHongShuCrawler`（支持 search/detail，依赖 Playwright 登录态）
- bili：`BilibiliCrawler`（支持 search/detail，Playwright 但整体风控较低）
- dy：`DouYinCrawler`（已接入）

入口工厂已在 [main.py](file:///workspace/MediaCrawler/main.py#L42-L74) 中支持平台分支创建 crawler。

### 2.2 统一落盘规则已存在

所有 crawler 通过 [async_file_writer.py](file:///workspace/MediaCrawler/tools/async_file_writer.py#L37-L44) 将 `contents/comments` 写入：

- `data/<platform>/jsonl/{crawler_type}_{item_type}_{YYYY-MM-DD}.jsonl`
- 例如：`data/xhs/jsonl/search_contents_2026-04-30.jsonl`

因此 Phase 4 的核心是：**让 MVP/OCR/LLM/KB 的“读取内容/读取评论/缓存路径/ID 解析/排序策略”变成平台无关**。

---

## 3. CLI 与 Cookie 管理

### 3.1 新增参数

新增 CLI 参数（cmd_arg/arg.py）：

- `--xhs-cookie <string>`：小红书 cookie 字符串（优先级高于 `config.COOKIES`）
- 预留参数（本期只解析并挂在 namespace/config，不强制接入 crawler）：
  - `--dy-cookie <string>`
  - `--bili-cookie <string>`

### 3.2 Cookie 优先级

当 `platform=xhs` 时，cookie 优先级：

1. `--xhs-cookie`
2. `config.COOKIES`（现有）

### 3.3 启动提示（xhs 无 cookie）

当 `platform=xhs` 且 `--xhs-cookie` 与 `config.COOKIES` 均为空时，启动时输出：

```
[WARN] XHS 未检测到有效 Cookie：search/detail 可能触发登录墙或风控失败。建议使用 --xhs-cookie 或在 config.COOKIES 配置登录态。
```

---

## 4. 统一 ID 解析（services/platform_id_parser.py）

### 4.1 API

新增：

`parse_video_id(platform: str, url_or_id: str) -> str`

### 4.2 规则

#### dy（抖音）

- 从输入中提取 `\d{8,}` 作为 `aweme_id`

#### xhs（小红书）

支持两类输入：

1) 完整 URL（优先）：`https://www.xiaohongshu.com/explore/<note_id>?xsec_token=...`
2) 仅 note_id：`<note_id>`

若仅 note_id：

- 解析器返回 note_id，并提供一个 “自动拼接 URL” helper：
  - `build_xhs_explore_url(note_id: str) -> str`
  - 默认拼：`https://www.xiaohongshu.com/explore/<note_id>`
  - 若没有 xsec_token，crawler 可能失败，此时由错误降级链给出风控提示（见第 8 节）

#### bili（哔哩哔哩）

支持：

- `BV...`（bvid）
- `https://www.bilibili.com/video/BV...`
- `av123...` / `https://www.bilibili.com/video/av123...`（aid）

输出 video_id 统一使用：

- 若有 bvid：`BV...`
- 否则：`av<aid>`

---

## 5. 平台适配器与工厂（services/platform_base.py + services/platform_factory.py）

### 5.1 BasePlatformAdapter（新增，轻量抽象）

新增 `services/platform_base.py`：

- `BaseFrameSampler / BaseOCRProvider / BaseVideoProcessor` 按需求保留为 Protocol（Phase 4 不强制改造 OCR/Download 的具体实现）
- 新增核心抽象：`BasePlatformAdapter`

建议接口（最小可落地集合）：

```python
class BasePlatformAdapter(Protocol):
    platform: str
    label: str

    def parse_video_id(self, url_or_id: str) -> str: ...
    def build_detail_url(self, url_or_id: str) -> str: ...

    def jsonl_root_dir(self) -> Path: ...
    def ocr_cache_dir(self) -> Path: ...

    def contents_glob(self, crawler_type: str) -> str: ...
    def comments_glob(self) -> str: ...

    def content_id_field(self) -> str: ...
    def comment_owner_id_field(self) -> str: ...

    def map_content_to_candidate(self, content: dict, *, source_keyword: str = "") -> Optional[VideoCandidate]: ...
    def search_rank_key(self, content: dict) -> float: ...
```

说明：

- `map_content_to_candidate` 负责把各平台落盘的 contents 行映射到统一字段（video_url/video_download_url/id/title/author/liked_count）
- `comments_owner_id_field` 用于在 JSONL comments 文件中筛选属于该视频的评论
  - dy：`aweme_id`
  - xhs：`note_id`
  - bili：`video_id`（可能是 aid，需在 adapter 内统一）

### 5.2 PlatformFactory

新增 `services/platform_factory.py`：

- 注册表：
  - `{"dy": DouyinAdapter, "xhs": XhsAdapter, "bili": BiliAdapter}`
- `PlatformFactory.create(platform: str) -> BasePlatformAdapter`

---

## 6. Search 排序策略（差异化）

### 6.1 dy

- 复用现有逻辑：`liked_count` 倒序

### 6.2 xhs（综合互动）

定义 `interactions = liked_count + collected_count + comment_count`，作为 search 结果排序 key（倒序）。

字段来源：xhs content item 中已有 `liked_count/collected_count/comment_count`（见 [store/xhs/update_xhs_note](file:///workspace/MediaCrawler/store/xhs/__init__.py#L108-L132)）。

### 6.3 bili（默认按 pubdate 最新）

默认 `pubdate` 倒序（最新优先）。

扩展预留：后续可增加 `--bili-sort pubdate|click`，但本期仅要求默认 pubdate。

---

## 7. 流水线改造点（平台无关化）

### 7.1 MVPPipeline：从 dy-only → 多平台

现状：`MVPPipeline._find_latest_source_contents_file` 明确限制 `platform == "dy"`，并且读取 `data/douyin/jsonl/detail_contents_*.jsonl`（见 [mvp_pipeline.py](file:///workspace/MediaCrawler/pipelines/mvp_pipeline.py#L70-L83)）。

Phase 4 改造目标：

- `MVPPipeline(platform=...)` 支持 dy/xhs/bili
- `_run_crawler()` 使用 `main.CrawlerFactory.create_crawler(platform)` 并设置对应 config：
  - `config.PLATFORM = platform`
  - `config.CRAWLER_TYPE = detail/search`
  - `config.KEYWORDS/START_PAGE/LIMIT/...` 复用现有 CLI 映射
  - 传入 cookie（xhs 优先 `--xhs-cookie`）
- `_find_latest_source_contents_file()` 改为：
  - `data/<platform>/jsonl/{crawler_type}_contents_*.jsonl`
- `_read_last_content_item()` 读取最后一条，交给 adapter 映射为统一 candidate（用于下载/ASR/OCR/评论）

### 7.2 OCR 缓存：按平台隔离

将 OCR 缓存目录从硬编码 `data/douyin/ocr_cache` 改为：

- `data/<platform>/ocr_cache/<video_id>.json`

并且 cache key 统一使用 `parse_video_id(platform, specified_id_or_url)`

### 7.3 评论缓存读取：按平台隔离 + owner 字段差异

将评论 JSONL 读取从 dy-only 改为：

- `data/<platform>/jsonl/*_comments_*.jsonl`
- 用 adapter 的 `comment_owner_id_field`（dy=aweme_id/xhs=note_id/bili=video_id）过滤属于该视频的评论行

### 7.4 SingleVideoRunner / BatchProcessor

保持核心逻辑不改的前提下：

- 将 “平台相关” 的：
  - video_id 解析
  - contents/comments 的 JSONL 读取路径
  - search 排序 key
  - OCR cache dir
  统一通过 adapter 注入

批量 search 验收要求：

- `--platform xhs --type search --keywords ... --limit N`：跑 search crawler → 读 search contents → 排序 TopN → 对每条 candidate 跑 SingleVideoRunner → 产出 results/runs/<run_id> 下的 mvp_output/analysis/report
- `--platform bili --type search ...` 同上

---

## 8. 错误处理与降级（强调 xhs 风控提示）

### 8.1 平台不支持

```
[ERROR] 不支持的平台: weibo，支持: dy|xhs|bili
```

### 8.2 视频 ID 解析失败

```
[WARN] 无法解析视频ID，请检查URL格式
```

### 8.3 xhs search 失败（风控/登录态）

当 platform=xhs 且 crawler_type=search，出现以下场景：

- Playwright 被登录墙拦截
- cookie 无效
- sign/xsec_token 缺失导致接口拒绝

统一降级文案（替代通用网络错误）：

```
[WARN] XHS search 抓取失败：疑似风控/登录态问题（Cookie 无效或缺失 / xsec_token 不可用）。建议：
  1) 使用 --xhs-cookie 提供登录态
  2) 或优先使用 detail 模式（传入完整笔记URL含 xsec_token）
```

仍需保证：

- 不中断主流程：search 失败则该次 search 结果为空，继续退出并生成可读错误输出
- 若是 batch 模式：跳过该平台/该批次，继续后续任务（未来可选 `--skip-platforms`）

---

## 9. 输出增强（平台字段 + 标题标识 + KB 分组）

### 9.1 mvp_output.json / mvp_analysis.json

新增字段：

- `platform: "dy"|"xhs"|"bili"`
- `video_id: "<aweme_id|note_id|BV...|av...>"`

### 9.2 mvp_report.md 标题

标题改为：

- `# [抖音] 视频分析报告`
- `# [小红书] 视频分析报告`
- `# [哔哩哔哩] 视频分析报告`

### 9.3 KnowledgeBase 聚合按平台分组

- `kb_index.jsonl` 每行加入 `platform`
- `kb_summary.md` 输出时按平台分组展示（每组保留标签统计 + 社区反馈 + 画面文字）

---

## 10. Prompt 模板的按平台覆盖（prompts.yaml）

保持当前 prompts.yaml 的默认模板不变，并支持“按平台覆盖”结构：

- `prompts.yaml` 中允许：
  - `knowledge_extract`（default）
  - `knowledge_extract@xhs`
  - `knowledge_extract@bili`

PromptStore 加载时优先取 `name@platform`，否则回退到 `name`。

---

## 11. 验收标准（全量）

### 11.1 小红书（search 全功能，带 Cookie）

```bash
python main.py --platform xhs --type search --keywords "穿搭" --limit 3 \
  --xhs-cookie "your_cookie_here" --enable-llm true --llm-model "gpt-4o" --llm-base-url "https://api.openai.com/v1"
```

### 11.2 哔哩哔哩（search 全功能）

```bash
python main.py --platform bili --type search --keywords "教程" --limit 3 \
  --enable-llm true --ocr-enabled true --llm-model "gpt-4o" --llm-base-url "https://api.openai.com/v1"
```

### 11.3 输出文件（平台无关格式）

- `results/runs/<run_id>/mvp_output_001_<video_id>.json`（含 platform 字段）
- `results/runs/<run_id>/mvp_report_001_<video_id>.md`（标题带平台标识）
- `data/<platform>/ocr_cache/<video_id>.json`（平台专属缓存目录）

### 11.4 终端日志（含平台标识）

```
[INFO] 平台: xhs, 模式: search, 视频ID: xxx
[INFO] 解析视频元数据: 标题="...", 作者="...", 点赞=1200
[INFO] OCR启用: interval=5s, model=ppocr_v4
[SUCCESS] 分析完成，输出: results/runs/xxx/mvp_report_001_xxx.md
```

