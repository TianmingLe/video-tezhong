# Phase 2.5：评论深度分析接入（comment-depth=2 + 真实数据流）设计文档

## 1. 概述

### 1.1 目标

在现有 `SingleVideoRunner + LLMAnalyzer + AnalysisPipeline` 基础上，实现 comment-depth 的真实评论数据流：

1. 当 `--comment-depth=2` 时，真正抓取视频下的高赞一级评论 + 二级回复
2. 将结构化评论送入 `LLMAnalyzer`：
   - `comment_value_judge` 使用真实评论数据
   - `community_insights` 生成社区共识/争议点
   - `knowledge_extract` 在 transcript 基础上融合高价值评论（valuable_comments）
3. 增强输出：
   - `mvp_analysis.json` 增加 `valuable_comments` 与 `community_insights`
   - `mvp_report.md` 新增 “💬 高赞评论精选” 与 “🗣️ 社区共识与争议”章节
   - `kb_index.jsonl` 新增 `comments_summary` 字段，便于跨视频聚合社区反馈

### 1.2 决策（已确认）

- 采用方案 B：两段式（抓取器 best-effort + 本地解析器）
- 采用选项 A：`comment_value_judge` 输出维持 `items[]`，valuable_comments 由后处理过滤生成

### 1.3 约束与兼容

- 向后兼容：不传 `--comment-depth` 时走“空评论保底”，不影响现有 pipeline
- 评论抓取失败：记录 warning，继续执行视频分析（不中断）
- LLM 评论分析失败：记录 error，输出空评论分析结果（不中断）
- LLM token 控制：评论输入在送入 LLM 前做截断，目标序列化后约 `<= 4000 tokens`（字符预算近似）
- Prompt 可配置：所有新增 prompt 模板写入 `config/prompts.yaml`

---

## 2. CLI 参数与配置

### 2.1 新增 CLI 参数（cmd_arg/arg.py）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--top-comments` | 20 | 一级高赞评论 TopM |
| `--top-replies` | 5 | 每条一级评论的高赞回复 TopK |
| `--force-regrab` | false | 强制重新抓取评论（忽略缓存） |

### 2.2 comment-depth 语义（兼容已有映射）

- `comment-depth=1`：抓一级评论；`ENABLE_GET_SUB_COMMENTS=False`
- `comment-depth=2`：抓一级+二级；`ENABLE_GET_SUB_COMMENTS=True`
- 不传 comment-depth：保持现有逻辑（comments=None）

### 2.3 新增 base_config 默认值（config/base_config.py）

| 配置项 | 默认值 | 说明 |
|------|--------|------|
| `TOP_COMMENTS_LIMIT` | 20 | 对应 `--top-comments` |
| `TOP_REPLIES_LIMIT` | 5 | 对应 `--top-replies` |

---

## 3. 评论数据来源决策（cache → online）

### 3.1 缓存文件（JSONL）

抖音评论落盘目录（未设置 SAVE_DATA_PATH 时）：

- `data/douyin/jsonl/`

文件名格式：

- `{crawler_type}_comments_{YYYY-MM-DD}.jsonl`

其中每行字段（用于筛选/构树的关键字段）：

- `aweme_id`
- `comment_id`
- `content`
- `like_count`
- `parent_comment_id`（一级评论通常为 `"0"`；二级评论为父评论 id）
- `nickname`（作者展示）

### 3.2 在线抓取入口（best-effort）

当缓存缺失，或用户显式 `--force-regrab=true` 时，尝试在线抓取：

- `DouYinClient.get_aweme_all_comments(aweme_id, max_count=..., is_fetch_sub_comments=..., callback=...)`

说明：

- `max_count` 仅限制一级评论数量（client 内部对一级分页做截断），二级评论是“一级评论的回复分页”追加抓取
- 抓取成功后应尽力写入 JSONL（写入失败不影响后续分析）
- 抓取失败仅 warning：将 comments 设为 None，继续后续视频分析（保底）

### 3.3 --force-regrab 行为

- `--force-regrab=false`（默认）：优先读缓存；若缓存中找不到该 aweme_id 任何评论，则在线抓取
- `--force-regrab=true`：强制在线抓取，并允许覆盖/追加缓存落盘

---

## 4. 断点续跑记录（processed_ids.jsonl）

在现有 `processed_ids_<run_id>.jsonl` 的每条记录中新增字段：

- `comment_grabbed: true/false`
- `comment_source: cache|online|none`

重跑策略：

- 若 `comment_grabbed=true` 且未 force：跳过在线抓取，直接从缓存构建评论结构并进入 LLM
- 若 `comment_grabbed=false`：允许再次尝试抓取

---

## 5. CommentProcessor（新增 services/comment_processor.py）

### 5.1 输入

- 读取缓存 JSONL：`*_comments_*.jsonl`（同目录内按 aweme_id 过滤）
- 或接收在线抓取的 comment list（原始字段可适配到统一结构）

### 5.2 输出（标准化结构）

```json
{
  "root_comments": [
    {
      "content": "评论内容",
      "like_count": 1200,
      "author": "用户A",
      "replies": [
        {"content": "回复内容", "like_count": 89, "author": "用户B"}
      ]
    }
  ],
  "stats": {
    "total_comments": 47,
    "total_root_comments": 10,
    "total_replies": 30,
    "top_comment_likes": 1200,
    "truncated": false
  }
}
```

### 5.3 TopM/TopK 筛选与构树规则

- 一级评论判定：`parent_comment_id == "0"`（或空值视为根）
- 二级回复判定：`parent_comment_id != "0"`，并且 parent_comment_id 对应某条 root 的 comment_id
- 一级 TopM：按 `like_count` 倒序取 `--top-comments`
- 回复 TopK：对每条 root 的 replies 按 `like_count` 倒序取 `--top-replies`
- 构建 thread tree：`root -> replies[]`

### 5.4 LLM token 控制（截断策略）

目标：将序列化后的 comments_json 控制在约 `<= 4000 tokens`（用字符预算近似）。

截断优先级：

1. 先减少 root_comments 数量（从 TopM 往下裁剪）
2. 再减少每条 root 的 replies 数量（从 TopK 往下裁剪）
3. 最后对 content 文本做截断（例如每条最大 N 字符）

输出 `stats.truncated=true/false` 标记是否发生截断。

---

## 6. SingleVideoRunner 改造（真实评论接入）

### 6.1 触发条件

当 `config.ENABLE_GET_COMMENTS=True` 时尝试加载/抓取评论并构建结构化 comments：

- 默认：cache → online（best-effort）
- online 触发：缓存缺失或 `--force-regrab=true`

当 `config.ENABLE_GET_SUB_COMMENTS=True`（comment-depth=2）时：

- 解析器输出 replies[]（TopK）
- 在线抓取时传 `is_fetch_sub_comments=True`

### 6.2 输出与日志

终端日志要求（示例）：

```
[INFO] 评论数据来源: cache
[INFO] 规范化评论: 一级 10 条, 回复 30 条, 已截断: false
[INFO] LLM 价值判定: 10 条评论中 3 条有干货
[SUCCESS] 评论分析完成，纳入知识点提取
```

当抓取失败时：

```
[WARN] 评论抓取失败：<错误>，将以空评论继续分析
```

---

## 7. LLMAnalyzer 增强（comments=None 向后兼容）

### 7.1 analyze() 新签名

新增参数：

- `comments: Optional[dict]`

兼容规则：

- `comments is None`：保持现有逻辑（comment_value_judge.missing_comments=true）
- `comments provided`：comment_value_judge 使用真实 comments_json

### 7.2 新增 community_insights prompt

新增 prompt：`community_insights`

输入：

- `video_topic`
- `comments_json`（结构化评论树）

输出 JSON：

```json
{
  "consensus": ["用户普遍认可..."],
  "controversy": ["部分用户质疑..."]
}
```

解析失败时输出空结构，不中断。

### 7.3 valuable_comments 后处理

保持 `comment_value_judge.items[]` 作为主输出结构（每条评论 `is_valuable/tags/reason`）。

新增 `valuable_comments` 字段，由后处理过滤：

```python
valuable_comments = [x for x in items if x.get("is_valuable") is True]
```

并将 `valuable_comments_json` 作为 `knowledge_extract` 的额外输入，辅助知识点提取。

---

## 8. Prompt 模板变更（config/prompts.yaml）

### 8.1 comment_value_judge（升级输入为评论树）

输入字段：

- `{video_topic}`
- `{comments_json}`

输出保持为数组 items[]：

每项包含：

- `comment_text`
- `is_valuable`
- `tags`
- `reason`

### 8.2 knowledge_extract（增加 valuable_comments）

输入字段：

- `{transcript}`
- `{ocr_text}`
- `{valuable_comments_json}`

输出字段保持为知识点数组：

- `title/content/timestamp`

### 8.3 community_insights（新增）

输入字段：

- `{video_topic}`
- `{comments_json}`

输出结构：

- `consensus[]`
- `controversy[]`

---

## 9. 输出增强

### 9.1 mvp_analysis.json 增量字段

新增：

```json
{
  "valuable_comments": [
    {"comment_text": "...", "tags": ["#避坑指南"], "reason": "..."}
  ],
  "community_insights": {
    "consensus": ["..."],
    "controversy": ["..."]
  }
}
```

### 9.2 mvp_report.md 新增章节（report_renderer.py）

新增章节：

- `## 💬 高赞评论精选`：展示 valuable_comments（不足时可回退展示 root_comments TopN）
- `## 🗣️ 社区共识与争议`：展示 consensus/controversy（为空则输出（无））

### 9.3 kb_index.jsonl 新增字段（knowledge_base.py）

新增字段：

- `comments_summary`：
  - `consensus` 前 N 条
  - `controversy` 前 N 条
  - `tags` 统计摘要

并在 `kb_summary.md` 聚合中增加跨视频社区反馈汇总段（规则去重即可，LLM 聚合后续可选）。

---

## 10. 错误处理与错误码

建议标准化错误码（供前端精确提示）：

- 评论抓取：
  - `ERR_COMMENTS_CACHE_MISS`
  - `ERR_COMMENTS_FETCH_FAILED`
- 评论解析：
  - `ERR_COMMENTS_PARSE_FAILED`
- LLM 评论分析：
  - `ERR_LLM_COMMENT_VALUE_FAILED`
  - `ERR_LLM_COMMUNITY_INSIGHTS_FAILED`

错误处理原则：

- 评论链路失败不影响 ASR/LLM 主流程：comments=None 继续
- LLM 评论分析失败：valuable_comments/insights 置空继续

---

## 11. 测试用例（TDD）

至少覆盖：

1. CommentProcessor：
   - root/replies 构树正确（parent_comment_id 关联）
   - TopM/TopK 排序正确
   - 截断策略触发时 stats.truncated=true
2. LLMAnalyzer：
   - comments=None 向后兼容
   - comments provided 时 prompt 输入包含 comments_json
   - valuable_comments 后处理过滤正确
3. SingleVideoRunner：
   - cache 优先策略：存在缓存则不触发在线抓取（除非 force）
   - online best-effort：失败时不中断，日志 warning
4. report_renderer / knowledge_base：
   - 新章节出现
   - kb_index 新字段存在

---

## 12. 验收标准

### 12.1 命令（detail + 评论深度=2）

```bash
python main.py --platform dy --pipeline mvp --specified_id <视频ID> \
  --comment-depth 2 --top-comments 10 --top-replies 3 \
  --force-regrab false \
  --enable-llm true --llm-model "gpt-4o" --llm-base-url "https://api.openai.com/v1"
```

### 12.2 输出文件增强

- `results/mvp_analysis.json` 包含 `valuable_comments` + `community_insights`
- `results/mvp_report.md` 新增 “💬” 和 “🗣️”章节
- 批量模式下：`processed_ids_<run_id>.jsonl` 记录 `comment_grabbed: true`

### 12.3 日志

必须出现类似：

```
[INFO] 评论数据来源: cache（或 online）
[INFO] 规范化评论: 一级 10 条, 回复 30 条, 已截断: false
[INFO] LLM 价值判定: 10 条评论中 3 条有干货
[SUCCESS] 评论分析完成，纳入知识点提取
```

### 12.4 断点续跑

重跑相同命令（无 `--force-regrab`）：

- 直接读缓存，不重复抓取

