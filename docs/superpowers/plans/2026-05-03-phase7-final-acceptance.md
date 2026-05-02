# Phase 7 Final Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出一份可审计的 Phase 7 最终验收结果：自动化门禁（unit/typecheck/e2e/build/pack）全绿，并记录关键路径手工回归结论。

**Architecture:** 不改业务逻辑为主，仅在需要时做最小修复以让门禁通过。验收记录写入 `docs/PHASE7_ACCEPTANCE.md`，包含命令输出摘要与 checklist 勾选，最终 commit 推送到分支。

**Tech Stack:** npm scripts + vitest + Playwright + electron-vite + electron-builder

---

## 0. File Map

**Create**
- `docs/PHASE7_ACCEPTANCE.md`

**Modify (only if needed)**
- 仅在门禁失败时修改对应最小范围文件

---

## Task A1: Run unit tests

- [ ] **Step 1: Run**

Run: `cd /workspace/desktop && npm test`  
Expected: PASS

- [ ] **Step 2: Capture summary**
  - 记录 Test Files / Tests 数量与 PASS

---

## Task A2: Run typecheck

- [ ] **Step 1: Run**

Run: `cd /workspace/desktop && npm run typecheck`  
Expected: PASS

- [ ] **Step 2: Capture summary**
  - 记录 “0 error” 或无输出即 PASS

---

## Task A3: Run E2E smoke (Playwright)

- [ ] **Step 1: Run**

Run: `cd /workspace/desktop && npm run test:e2e`  
Expected: PASS

- [ ] **Step 2: If FAIL**
  - 读取 Playwright 报告输出（console + screenshot path）
  - 最小修复（只修失败用例路径）
  - 重跑 `npm run test:e2e` 直到 PASS

---

## Task A4: Build artifacts

- [ ] **Step 1: Build**

Run: `cd /workspace/desktop && npm run build`  
Expected: PASS

- [ ] **Step 2: Pack**

Run: `cd /workspace/desktop && npm run pack`  
Expected: PASS（生成 electron-builder 目录产物）

- [ ] **Step 3: Capture summary**
  - 记录 build/pack 成功与关键摘要（不贴全量日志）

---

## Task B1: Write acceptance record (docs/PHASE7_ACCEPTANCE.md)

**Files:**
- Create: `docs/PHASE7_ACCEPTANCE.md`

- [ ] **Step 1: Add header + metadata**

Include:
- 分支名
- 最新 commit hash（`git rev-parse --short HEAD`）
- 日期（北京时区）

- [ ] **Step 2: Add automation gate results**

Include:
- `npm test`（PASS + 数量摘要）
- `npm run typecheck`（PASS）
- `npm run test:e2e`（PASS）
- `npm run build`（PASS）
- `npm run pack`（PASS）

- [ ] **Step 3: Add manual checklist**

Use checklist bullets:
- [ ] Onboarding success path
- [ ] Onboarding failure path
- [ ] Tasks submit/run/cancel
- [ ] Reports load/export
- [ ] Settings update/log cleanup/feedback
- [ ] ErrorBoundary copy/go tasks/reload

Mark items as PASS/NOTE based on what was verified in this session.

- [ ] **Step 4: Commit**

```bash
git add docs/PHASE7_ACCEPTANCE.md
git commit -m "docs: phase 7 final acceptance record"
```

---

## Task B2: Push branch

- [ ] `cd /workspace && git push origin trae/solo-agent-M3pw1t`

