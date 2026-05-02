# Nightly Auto Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** main 每次 push 且通过门禁后，自动构建 Windows/macOS/Linux 安装包，并发布到固定的 `nightly` 预发布 Release。

**Architecture:** 新增 `nightly.yml` 工作流：matrix 构建 → 上传 artifacts → 统一 release job 强制更新 `nightly` tag → 创建/更新 `nightly` Release 并上传产物（文件名追加短 hash）。

**Tech Stack:** GitHub Actions + electron-builder + softprops/action-gh-release

---

## 0. File Map

**Create**
- `.github/workflows/nightly.yml`

---

### Task 1: Add Nightly workflow skeleton

**Files:**
- Create: `.github/workflows/nightly.yml`

- [ ] **Step 1: Create workflow with main push trigger**

Create `.github/workflows/nightly.yml`:

```yaml
name: Nightly

on:
  push:
    branches: [main]

permissions:
  contents: write

concurrency:
  group: nightly-release
  cancel-in-progress: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci(nightly): add workflow skeleton"
```

---

### Task 2: Add matrix build job (win/mac/linux)

**Files:**
- Modify: `.github/workflows/nightly.yml`

- [ ] **Step 1: Add build job**

Add job:
- `strategy.matrix.os: [ubuntu-latest, windows-latest, macos-latest]`
- `working-directory: desktop`
- steps:
  - checkout
  - setup-node@v4 (node 20, cache npm, cache-dependency-path desktop/package-lock.json)
  - `npm ci --no-audit --no-fund`
  - `npm run validate:yaml`
  - `npm test`
  - `npm run typecheck`
  - `npm run dist` with `CSC_IDENTITY_AUTO_DISCOVERY=false`
  - rename installers to include short SHA
  - upload-artifact (name includes OS)

Rename step (bash):

```bash
SHORT_SHA=${GITHUB_SHA::7}
cd release
for f in *.exe *.dmg *.AppImage; do
  if [ -f "$f" ]; then
    ext="${f##*.}"
    base="${f%.*}"
    mv "$f" "${base}-${SHORT_SHA}.${ext}"
  fi
done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci(nightly): build installers on main push"
```

---

### Task 3: Add release job (update nightly tag + upload assets)

**Files:**
- Modify: `.github/workflows/nightly.yml`

- [ ] **Step 1: Add release job**

Release job runs on ubuntu:
- needs: build
- download artifacts to `artifacts/`
- update `nightly` tag (force):

```bash
git fetch --tags origin
git tag -f nightly "$GITHUB_SHA"
git push -f origin nightly
```

- use `softprops/action-gh-release@v2`:
  - `tag_name: nightly`
  - `name: nightly`
  - `prerelease: true`
  - `make_latest: false`
  - `files: artifacts/**/release/**/*`

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci(nightly): publish rolling nightly release"
```

---

### Task 4: Verify locally and push

**Files:**
- None (verification)

- [ ] **Step 1: Sanity check YAML file exists**

Run: `test -f .github/workflows/nightly.yml && echo ok`

- [ ] **Step 2: Push**

```bash
git push origin main
```

Expected:
- GitHub Actions 出现 Nightly workflow run
- Release 列表出现/更新 `nightly` 预发布，含 `.exe/.dmg/.AppImage`

