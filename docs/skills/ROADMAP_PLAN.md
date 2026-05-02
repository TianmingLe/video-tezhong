# OmniScraper Pro（video-tezhong）功能现状与未来路线图（计划书）

> 说明：本计划书综合当前仓库“Desktop（桌面端）+ MediaCrawler（CLI 爬虫）”两条产品线，给出：
> - 已完成能力清单（可交付/可验证）
> - 下一步任务与里程碑（按阶段 + 按模块拆分）
> - 关键依赖、风险与验收口径

## 目录

- 1. 项目定位与交付形态
- 2. 当前已完成能力（按模块）
- 3. 未来路线图（按阶段 + 模块）
- 4. 关键工程任务清单（可直接派工）
- 5. 风险、依赖与发布策略
- 6. 验收与度量（Definition of Done）

---

## 1. 项目定位与交付形态

### 1.1 两条产品线

1) **Desktop（Electron 桌面端）**
- 目标：让普通用户无需环境配置即可运行，通过 UI 提交/查看任务、导出日志、反馈问题、更新与卸载。
- 交付：Windows `.exe`、macOS `.dmg`、Linux `.AppImage`
- 下载入口：
  - Nightly：`/releases/tag/nightly`（滚动更新）
  - Release：`/releases`（v* 固定版本）

2) **MediaCrawler（Python 爬虫框架/CLI）**
- 目标：多平台爬取、反爬对抗、代理池、存储到多种格式/数据库，面向工程化采集。
- 交付：Python 项目（CLI/脚本），目前文档与代码结构完善。

### 1.2 当前阶段判断

- MediaCrawler：具备“框架形态”，但需要进一步收敛为“可复用 pipeline/接口”，与 Desktop 打通。
- Desktop：已具备“可运行、可打包、可发布（nightly + v*）”，但在“自动更新/签名/更完整的用户路径回归”上仍有提升空间。

---

## 2. 当前已完成能力（按模块）

### 2.1 Desktop（桌面端）

**交付/发布能力**
- CI：`npm test` / `npm run typecheck` 门禁已稳定
- Nightly：main 每次 push 自动构建并发布到固定 `nightly` release（Windows/macOS/Linux）
- v* Release：打 tag 自动构建并生成版本化 Release（beta/rc/正式）

**核心产品能力**
- Onboarding：Python 检测（成功/失败路径），不白屏
- Tasks：任务提交、队列执行、状态与 exitCode、历史记录
- Reports：归档日志按 chunk 读取、导出日志（缺失归档时有 fallback）
- Settings：
  - 检查更新（状态可变化）
  - 日志清理（preview → confirm → cleanup）
  - 反馈问题（生成诊断信息并复制）
  - Windows 一键卸载（确认后拉起卸载器并退出）
- ErrorBoundary：统一错误页、复制错误信息、返回任务页/重载
- i18n：基础多语言/可扩展结构

**工程稳定性修复（已沉淀为经验）**
- Node 环境无 `navigator` 的防御性编程
- Windows 下 sqlite 文件锁（better-sqlite3 未 close 导致 EBUSY）修复
- electron-builder provider 推断失败（desktop 子目录）修复
- Nightly 上传不该上传的中间文件（PkgInfo 等）修复

### 2.2 MediaCrawler（CLI/爬虫）

**架构与平台覆盖（来自现有文档）**
- 支持平台：xhs / dy / ks / bili / wb / tieba / zhihu
- 支持多种登录、存储（CSV/JSON/JSONL/SQLite/MySQL/MongoDB/Excel）
- 反爬对策：CDP、代理池、请求签名、stealth
- 异步高并发：asyncio 架构

**现有可用链路（README 指向）**
- Phase 1 MVP：dy detail → 下载 → Whisper 转写 → 输出结构化结果 → 清理视频但保留链接

---

## 3. 未来路线图（按阶段 + 模块）

> 结构：先按阶段（近/中/远），每个阶段内部再按模块（Desktop / MediaCrawler / 跨模块/发布）拆分。

### 阶段 0：立即（0–2 周）——“可用性与交付稳定”

#### Desktop（用户体验优先）
- 关键用户路径的手工回归 checklist 完成并固化（Onboarding/Tasks/Reports/Settings/ErrorBoundary）
- 将手工回归步骤写入 `docs/`，形成每次发版的“最低人工验证”
- 增加“版本信息页/关于页”：显示 version、commit hash、nightly 标记（用户反馈更可定位）

#### 发布与运维（稳定性优先）
- Nightly release notes 自动包含：
  - commit hash
  - 最近 N 条 commit summary（可选）
- Nightly 失败时将原因聚合到一段“可行动的提示”（例如上传失败/打包失败/测试失败）
- Release 工作流明确区分 beta/rc 与 stable（prerelease/是否 latest）

#### MediaCrawler（工程可复现）
- 统一一个“最小可复现 pipeline”文档：输入/输出/数据目录约定
- 为 dy MVP 增加“失败不中断、记录失败原因”的批处理模式（输出 JSONL）

**验收口径**
- nightly 每次 main push 都能产出三平台安装包
- Desktop 手工回归 checklist 完成率 100%（每次发版都勾选）

---

### 阶段 1：短期（2–8 周）——“从工具到产品：稳定发布 + 可扩展任务”

#### Desktop（产品化）
- 更清晰的任务模板（Template/Presets）：常用任务一键创建
- 任务参数校验与错误提示体系（减少运行后失败）
- 任务执行资源控制：
  - 并发限制配置化
  - 超时策略
  - 失败重试策略（可选）
- 日志与报告体验：
  - 关键步骤摘要（timeline）
  - 报告一键复制/导出 markdown

#### Desktop（更新与分发）
- 自动更新链路完整走通（nightly/稳定版分渠道）
- Windows/macOS 签名与可信分发（减少 SmartScreen/Gatekeeper）

#### MediaCrawler（能力收敛）
- 抽象出“平台无关”的 pipeline 接口：
  - 输入：URL/关键词/作者ID
  - 输出：结构化 JSONL（统一 schema）
- 批处理能力：
  - search + limit
  - 多关键词队列
  - run_id 与可追踪失败

#### 跨模块（Desktop ↔ MediaCrawler）
- Desktop 调用 MediaCrawler 的统一执行入口：
  - 以“子进程 + 明确定义的 stdout JSON 事件流”作为协议
  - Desktop 负责可视化与队列，MediaCrawler 负责采集

**验收口径**
- Desktop 可以一键跑 MediaCrawler 的至少 1 条 pipeline（dy 或 xhs），并能在 UI 里展示进度与结果
- 自动更新可在至少一个平台稳定工作

---

### 阶段 2：中期（2–6 个月）——“规模化能力：多平台、多导出、LLM 分析闭环”

#### MediaCrawler（规模化）
- 代理池与账号池的可观测性：
  - 成功率、封禁率、切换频率
  - 失败类型分布
- 存储的统一抽象：
  - 本地文件 + SQLite（默认）
  - MySQL/MongoDB（可选）

#### LLM / 处理链路（价值提升）
- 接入 LLM 进行：
  - 摘要、标签、结构化要点
  - 评论聚类/情感倾向
  - 主题提取
- 输出增强：
  - Markdown 报告
  - Excel/CSV 报表
  - 可直接用于“选题/脚本/投放”的模板输出

#### Desktop（产品闭环）
- “任务 → 处理 → 报告 → 导出/分享”全链路标准化
- 多工作区/多项目管理（不同客户/不同主题分开）

**验收口径**
- 同一套任务在 2+ 平台可复用（输入 schema 一致）
- 产出报告可直接用于内容生产（可复制/可导出/可留档）

---

## 4. 关键工程任务清单（可直接派工）

### 4.1 Desktop：稳定性与体验
- [ ] 增加 About/Version 页面（version、commit hash、nightly 标识）
- [ ] 手工回归 checklist 固化到 release runbook，并在发版前强制执行
- [ ] 更细粒度的错误分类（用户可读 + 开发可定位）
- [ ] 任务模板/预设（减少用户配置成本）

### 4.2 Desktop：发布与更新
- [ ] 自动更新渠道分离（nightly vs stable）
- [ ] Windows 代码签名 / macOS notarization（减少系统拦截）
- [ ] Release 资产命名与兼容性（避免路径/空格/特殊字符导致安装器异常）

### 4.3 MediaCrawler：批处理与稳定输出
- [ ] 统一输出 schema（JSONL），包含 run_id、platform、source、timestamps、errors
- [ ] 批处理 search + limit、失败不中断策略
- [ ] 代理池健康检查与可观测指标（成功率、失败原因）

### 4.4 Desktop ↔ MediaCrawler：协议与打通
- [ ] 定义子进程协议（stdout 事件：progress/log/result/error）
- [ ] Desktop 侧解析事件并写入 DB（Run/Logs/Reports）
- [ ] 端到端 demo：选择平台→输入→运行→报告→导出

### 4.5 文档与流程（持续）
- [ ] 文档版本化：USER_MANUAL / TROUBLESHOOTING / LESSONS_LEARNED / ROADMAP 持续更新
- [ ] 将“典型故障”整理为 FAQ + 自动化检测（如 Python 不存在、路径不可写）

---

## 5. 风险、依赖与发布策略

### 5.1 依赖风险

- 平台反爬策略变化（需要持续维护）
- 代理供应商稳定性（IP 质量波动）
- LLM 成本与稳定性（需要缓存/降级/重试）
- 桌面端签名/公证的证书成本与流程复杂度

### 5.2 发布策略（推荐）

- 日常验证：Nightly（滚动更新）
- 阶段性交付：beta tag（v0.0.1-beta.N）
- 对外正式：stable tag（v0.1.0 / v1.0.0）

---

## 6. 验收与度量（Definition of Done）

### 6.1 Desktop 功能完成（DoD）

- 单测与 typecheck 全绿
- nightly 发布成功（至少 Windows/macOS/Linux 产物存在）
- 用户手册与排障手册同步更新
- 关键路径手工回归 checklist 勾选完成

### 6.2 Pipeline/爬虫能力完成（DoD）

- 输入/输出 schema 固定且有文档
- 失败可追踪（错误码/错误原因/重试策略）
- 能够批处理并保证“失败不中断”

### 6.3 LLM 能力完成（DoD）

- 有明确的输出格式模板（Markdown/Excel/JSON）
- 成本可控（缓存/去重/限流）
- 有降级策略（LLM 不可用时仍可输出基础结果）

