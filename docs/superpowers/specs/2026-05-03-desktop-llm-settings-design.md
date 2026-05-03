# Desktop：LLM 全局配置 + 报告页分析展示（A 范围）

## 背景与目标

在 Desktop 内置的 MediaCrawler 任务中加入可配置的 LLM 能力，并把产出的 LLM 分析结果在报告页以结构化形式展示出来。

本次交付范围选择为：
- 全局 LLM 配置（Settings 配置 model/baseUrl/key）
- Key 安全存储优先（safeStorage 加密），不可用时允许明文存储（用户明确选择）
- 任务启用 LLM 时自动注入配置；若缺失则在启动前弹窗补齐，可选择写回为默认
- 报告页展示当前 run 的 LLM 输出聚合摘要（不做跨 run 聚类/情感）

## 非目标

- 不做跨多个 run/跨账号的聚类、情感倾向模型、用户自定义分类指令
- 不新增复杂的 OAuth/多租户密钥体系
- 不在本次实现 LLM 的可用性探测/连通性测试（可后续加）

## 术语

- run：一次任务执行（runId）
- MediaCrawler：内置的采集与分析管道
- LLM 配置：`api_base` / `model` / `api_key`

## 用户体验（UX）

### Settings：LLM 配置

在 Settings 页新增一张卡片「LLM」：
- 开关：是否默认启用 LLM（可选；本次可先不做开关，仅由任务模板的 enableLlm 控制）
- Base URL：文本输入，例如 `https://api.openai.com/v1`
- Model：文本输入，允许任意字符串（用户可自行填主流模型或自定义模型）
- API Key：密码输入框（显示为 `••••`），支持“清除 Key”
- 保存：写入配置
- 状态提示：显示是否启用安全存储（safeStorage 可用/不可用）

约束：
- UI 不展示明文 key
- 不在日志中打印 key

### 任务启动时的弹窗补齐

当用户在任务模板勾选「启用 LLM」，但 Settings 缺失任一项：
- 启动前弹窗输入缺失项（model/baseUrl/key）
- 用户确认后写回 Settings（成为新的全局默认）
- 用户取消则降级：本次任务继续跑但不启用 LLM（即 enableLlm=false）

## 数据与存储设计

### 配置文件

参考 tray-config 的文件存储方式，新增：
- `<userData>/llm-config.json`

结构（示例）：
```json
{
  "apiBaseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o-mini",
  "keyStorage": "safeStorage",
  "apiKeyCiphertextBase64": "....",
  "updatedAt": 1777770000000
}
```

当 safeStorage 不可用且用户允许明文：
```json
{
  "apiBaseUrl": "https://api.openai.com/v1",
  "model": "xxx",
  "keyStorage": "plain",
  "apiKeyPlain": "sk-...",
  "updatedAt": 1777770000000
}
```

### 加密策略

- `safeStorage.isEncryptionAvailable() === true`：
  - 用 `safeStorage.encryptString(key)` 得到 Buffer，base64 落盘
  - 读取时 `safeStorage.decryptString(Buffer.from(b64, 'base64'))`
- 否则：
  - 按用户选择允许明文存储，保存到 `apiKeyPlain`

## IPC 与 API 设计

新增 IPC：
- `llm:getConfig`：返回当前配置（不返回明文 key，仅返回 `hasKey`、`apiBaseUrl`、`model`、`keyStorage`、`encryptionAvailable`）
- `llm:setConfig`：写入 `apiBaseUrl`、`model`、`apiKey`（apiKey 仅用于写入；返回同 getConfig 的结果）
- `llm:revealKey`（可选，不做）：本次不提供读取明文 key 的能力

Preload 暴露：
- `window.api.llm.getConfig()`
- `window.api.llm.setConfig({ apiBaseUrl, model, apiKey })`

## 运行时注入与管道对接

Renderer 在发起 `job.start` 前：
- 若任务配置 `enableLlm=true`：
  - 读取 `llm.getConfig`
  - 如果缺失项，弹窗补齐并写回 `llm.setConfig`
  - 将 `llmModel` / `llmBaseUrl` / `llmApiKey` 写入 job payload

Main 在收到 mediacrawler job.start payload 时：
- 保持现有 runner 逻辑
- 透传 LLM 参数到 task.json（由 runner 调用 MediaCrawler CLI 的 `--enable_llm --llm_model --llm_base_url --llm_api_key`）

## 报告页展示设计（当前 run）

在 ReportPage 增加「LLM 分析」卡片：
- 读取 run 目录下 `mvp_analysis_*.json`（或 `results/mvp_analysis.json`）
- 聚合展示：
  - 成功/失败计数
  - `usage.total_tokens` / `usage.cost_usd` 汇总
  - `community_insights.consensus/controversy` 汇总去重
  - `knowledge_points` 数量汇总，Top N 标题
  - `comment_value_judge.items` 的 tags 统计 Top N

实现方式：
- 复用已实现的受控读文件 IPC（listRunArtifacts/readRunFile）
- 在 renderer 解析 JSON，做聚合展示

## 错误处理

- Settings 保存失败：toast 提示
- safeStorage 加密失败：toast 提示并不写入（除非走明文策略）
- 报告页 JSON 解析失败：显示错误信息，不影响其它模块

## 测试策略

- main：
  - llm-config 读写与加密/明文分支的单测（fs stub + safeStorage stub）
  - IPC handler 输入校验测试
- renderer：
  - config 缺失时弹窗补齐逻辑的单测（尽量用纯函数抽离）
  - 报告页聚合函数单测（给定多份 mvp_analysis JSON 产出汇总）

## 交付验收

- Settings 可保存 baseUrl/model/key；重启应用仍生效
- 任务勾选 enableLlm 后，会自动注入并触发 MediaCrawler 的 LLM 分析产物生成
- 报告页可展示本次 run 的 LLM 聚合摘要

