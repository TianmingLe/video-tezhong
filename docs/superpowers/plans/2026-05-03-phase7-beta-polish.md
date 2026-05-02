# Phase 7 (Beta Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打磨 OmniScraper Desktop 进入 Beta：GitHub Releases 自动更新（Toast 提示）、首次启动 Onboarding（JSON 状态 + Python 检测）、性能与内存优化、错误边界与复制、i18n 架构预留、反馈通道与用户手册。

**Architecture:** 主进程新增 UpdateService + SystemCheck + OnboardingStore(JSON) + LogCleanup；Renderer 增加 ToastHost、OnboardingFlow、ErrorBoundary、FeedbackPack；CI release workflow 从 Draft 改为 Latest release；所有新增逻辑 TDD 先行。

**Tech Stack:** TypeScript + Electron + electron-updater + electron-builder(GitHub publish) + vitest

---

## 0. File Map

**Create**
- `desktop/electron/main/update/UpdateService.ts`
- `desktop/electron/main/update/UpdateService.test.ts`
- `desktop/electron/renderer/src/components/toast/ToastHost.tsx`
- `desktop/electron/renderer/src/components/toast/toastStore.ts`
- `desktop/electron/renderer/src/components/toast/ToastHost.test.tsx`
- `desktop/electron/main/onboarding/onboardingStore.ts`
- `desktop/electron/main/onboarding/onboardingStore.test.ts`
- `desktop/electron/renderer/src/pages/OnboardingPage.tsx`
- `desktop/electron/main/system/checkPython.ts`
- `desktop/electron/main/system/checkPython.test.ts`
- `desktop/electron/renderer/src/components/ErrorBoundary.tsx`
- `desktop/electron/renderer/src/components/ErrorBoundary.test.tsx`
- `desktop/electron/renderer/src/i18n/I18nProvider.tsx`
- `desktop/electron/renderer/src/i18n/t.ts`
- `desktop/electron/main/feedback/collectFeedbackBundle.ts`
- `desktop/electron/main/feedback/collectFeedbackBundle.test.ts`
- `docs/USER_GUIDE.md`

**Modify**
- `.github/workflows/release.yml`
- `desktop/package.json` / `desktop/package-lock.json`
- `desktop/electron-builder.yml`
- `desktop/electron/shared/ipc.ts` / `ipc.test.ts`
- `desktop/electron/preload/types.ts` / `preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`
- `desktop/electron/renderer/src/pages/TasksPage.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`
- `desktop/electron/renderer/src/router.tsx`

---

## Task 1: 自动更新（electron-updater）+ release workflow 改 Latest（TDD）

- [ ] **Step 1: Add failing test for UpdateService state machine**
- [ ] **Step 2: Add electron-updater dependency**
- [ ] **Step 3: Implement UpdateService (main)**
- [ ] **Step 4: Add IPC: update.check / update.install / update.state / update:event**
- [ ] **Step 5: Renderer ToastHost: downloaded → show toast with “立即重启/稍后”**
- [ ] **Step 6: Update release.yml to publish Latest release (non-draft)**
- [ ] **Step 7: Gate + Commit**

---

## Task 2: Onboarding（JSON 状态 + Python 检测）（TDD）

- [ ] **Step 1: onboardingStore tests (read/write/reset)**
- [ ] **Step 2: main system:checkPython tests + implementation**
- [ ] **Step 3: IPC: onboarding.get/onboarding.complete/onboarding.reset + system.checkPython**
- [ ] **Step 4: OnboardingPage (3 steps) + router guard**
- [ ] **Step 5: Settings “重新开始引导”**
- [ ] **Step 6: Gate + Commit**

---

## Task 3: 性能与内存优化（TDD 可测部分）

- [ ] **Step 1: LogViewer enforce max lines 10k (unit test helper)**
- [ ] **Step 2: Log cleanup tool (keep latest 50) + tests**
- [ ] **Step 3: Route-level lazy load (KB/Settings)**
- [ ] **Step 4: Gate + Commit**

---

## Task 4: 错误边界 + 复制错误信息（TDD）

- [ ] **Step 1: ErrorBoundary tests (render fallback + copy button)**
- [ ] **Step 2: Wire ErrorBoundary at AppShell root**
- [ ] **Step 3: Gate + Commit**

---

## Task 5: i18n 架构预留（默认中文）

- [ ] **Step 1: Add I18nProvider + t(key) minimal dictionary**
- [ ] **Step 2: Wrap App root with I18nProvider**
- [ ] **Step 3: Gate + Commit**

---

## Task 6: 反馈通道 + USER_GUIDE

- [ ] **Step 1: collectFeedbackBundle (crash/system/runId) tests**
- [ ] **Step 2: IPC: feedback.collect → returns text payload (issue template)**
- [ ] **Step 3: Settings “反馈问题” button (copy to clipboard)**
- [ ] **Step 4: docs/USER_GUIDE.md**
- [ ] **Step 5: Gate + Commit**

---

## Task 7: 最终门禁 + 推送

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run dist`（至少 Linux 本地验证一次）

