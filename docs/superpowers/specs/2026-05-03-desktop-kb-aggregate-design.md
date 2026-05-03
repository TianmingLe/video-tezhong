# Desktop：Reports 多选聚合（规则版）+ 一键导出 + 删除

## 背景与目标

在 Desktop 的“报告（Reports）”列表页支持多选多个 run（跨视频），基于每个 run 的产物（尤其是 `mvp_analysis_*.json`）进行规则聚合，生成：
- 可读的聚合 Markdown（知识库总结）
- 可二次处理的结构化 JSON（index/tags/insights 等）

并提供：
- 预览
- 自动保存到本地 results 目录（便于回看）
- 一键导出到用户自选目录
- 一键/自定义删除部分聚合结果文件

本设计不依赖 LLM。

## 非目标

- 不做用户自定义分类指令（那是 C）
- 不改写/删除原始 run 的采集产物（只管理“聚合产物”）
- 不做复杂的知识点相似度聚类（规则去重即可）

## 现有事实与约束

- Desktop 端的每个任务 runId 对应一个 `runDir=<userData>/results/runs/<runId>/`
- runner 会把 `mvp_analysis_*.json` 复制到 runDir 根目录（便于前端读取）
- Renderer 已有 `window.api.job.history()` 获取历史 run 列表
- Renderer 已有 `listRunArtifacts/readRunFile` 对单个 run 的文件进行受控读取

## 用户体验（UX）

### Reports 列表页：多选与聚合

在“报告”列表页增加：
- 多选模式开关（或始终显示 checkbox）
- 每行一个 checkbox（默认不选中）
- 顶部工具条按钮：
  - 生成聚合（disabled：未选中）
  - 清空选择
  - 查看聚合历史（可选，第一版可不做）

生成聚合后：
- 在页面内展示“聚合预览卡片”（无需跳转页面）
- 预览卡片提供：
  - 生成时间、包含 run 数量、成功解析数/失败数
  - tabs：Markdown / JSON（或下拉选择文件预览）
  - 导出按钮（另存为）
  - 删除按钮（见“删除”）

### 自动保存与导出

生成时自动保存到：
- `<userData>/results/aggregates/<timestamp>_<nRuns>/`

目录内文件命名建议：
- `kb_summary.md`
- `kb_index.jsonl`
- `kb_tags.json`
- `kb_insights.json`（包含共识/争议、OCR key_texts、统计信息等）
- `meta.json`（包含选中 runId 列表、生成时间、版本号等）

导出行为：
- “导出”仅把选中的聚合文件复制到用户选择的位置（或打包成 zip 可后续做；第一版按逐文件保存）
- 导出不修改自动保存的结果

### 删除（支持一键与自定义）

删除范围限定在 aggregates 目录内的“聚合产物”，不触碰原始 run 目录。

提供两种删除方式：
- 一键删除本次聚合目录（删除整个 `<timestamp>_<nRuns>` 文件夹）
- 自定义删除：弹窗勾选要删除的文件（例如仅删 `kb_index.jsonl` 或仅删 `kb_summary.md`）

删除后 UI 立即刷新预览状态。

## 聚合规则（内容 B：更丰富）

输入：多个 run 的 `mvp_analysis_*.json`（每个 run 最多读取前 N 个，默认 50）。

输出由 4 部分组成：

1. **视频索引（kb_index.jsonl）**
   - 每行一个视频条目（从 analysis 文件推断）
   - 字段建议：
     - `run_id`
     - `aweme_id`（从文件名里提取，若没有则空）
     - `video_url`
     - `source_keyword`
     - `tags`（来自 comment_value_judge.items[].tags 的扁平化）
     - `knowledge_points`（原样保留，便于后续处理）
     - `community_insights`（consensus/controversy）
     - `ocr_summary`（若存在则带上 key_texts/统计）
     - `analysis_file`

2. **标签统计（kb_tags.json）**
   - `{ tag: count }`
   - 过滤规则：可选（例如 count>=2）

3. **洞察汇总（kb_insights.json）**
   - `runs`: 选中 run 列表
   - `stats`: 成功/失败计数、解析失败原因计数、总 tokens/成本（如果字段存在）
   - `community`: 跨视频去重后的 `consensus/controversy` 列表（各 Top 50）
   - `ocr`: 跨视频去重后的 `key_texts` 列表（Top 100）
   - `knowledge_titles`: 知识点 title 去重 Top 100

4. **知识库总结（kb_summary.md）**
   - 固定结构（规则生成）：
     - 标题
     - 视频索引（runId + video_url）
     - 聚合知识点（按 title/content 去重，Top 50）
     - 标签统计 Top 20
     - 社区反馈：共识/争议（各 Top 20）
     - 画面文字：OCR key_texts（Top 30）

去重规则（第一版）：
- key = `title` 或 `content` 的归一化（trim）
- 相同 key 视为重复

## IPC 与模块划分

### Renderer

新增一个纯函数聚合模块：
- 输入：`analysis json` 数组 + runId
- 输出：`AggregateBundle`（包含 md 文本与 json 对象）

ReportsPage 负责：
- 选择 run
- 触发聚合（先读取文件，再聚合）
- 预览（Markdown 使用 `<pre>`）
- 调用 main 保存/导出/删除

### Main

新增聚合结果管理能力：
- `aggregate:save`：写入 `<userData>/results/aggregates/<dir>/...` 返回目录与文件列表
- `aggregate:export`：弹出保存对话框（或选择目录）并复制选择的文件
- `aggregate:delete`：删除目录或删除目录内指定文件集合
- `aggregate:list`（可选）：列出 aggregates 下的历史目录用于回看
- `aggregate:readFile`（可选）：用于从 aggregates 目录读取文件内容（否则复用现有 job.readRunFile 不合适）

安全约束：
- 删除只允许在 `<userData>/results/aggregates/` 下
- 不允许 path traversal

## 测试策略

- 聚合纯函数单测（输入 2-3 份模拟 mvp_analysis，验证：
  - tags 统计
  - 共识/争议去重
  - OCR key_texts 去重
  - md 结构包含关键章节）
- main 侧删除/保存路径校验单测（内存 fs stub）

## 验收标准

- Reports 页可多选至少 2 个 run 并生成聚合预览
- 自动写入 `<userData>/results/aggregates/...`，内容包含 md + json
- 支持导出到用户选择位置
- 支持一键删除目录与自定义删除部分文件
- 全量 typecheck + tests 通过

