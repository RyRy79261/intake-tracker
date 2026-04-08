# Phase 27: Release Automation — Research

**Researched:** 2026-04-04
**Confidence:** HIGH — All tools well-documented, established ecosystem, straightforward integration

## 1. Domain Overview

Phase 27 replaces the fragile keyword-based `version-bump.yml` with a proper Release Please pipeline, adds commitlint + husky for conventional commit enforcement, and produces changelogs, semver tags, and GitHub Releases automatically on every merge to main.

The three core components:
1. **commitlint + husky** — Client-side commit message validation via git hooks
2. **Release Please Action** — Server-side release automation triggered on push to main
3. **Version bootstrap** — Reconcile `package.json` version and create historical anchor tag

## 2. Technical Research

### 2.1 Commitlint + Husky Setup (REL-01)

**Packages required:**
- `@commitlint/cli` — CLI for linting commit messages
- `@commitlint/config-conventional` — Conventional commit rule preset
- `husky` — Modern git hooks manager (v9+)

**Installation (pnpm):**
```bash
pnpm add -D @commitlint/cli @commitlint/config-conventional husky
```

**Commitlint config file:** `commitlint.config.js` at repo root
```js
export default { extends: ['@commitlint/config-conventional'] };
```

**Husky initialization:**
```bash
pnpm husky init
```
This creates `.husky/` directory and adds `"prepare": "husky"` to `package.json` scripts.

**Commit-msg hook:** `.husky/commit-msg`
```bash
pnpm dlx commitlint --edit $1
```

**Allowed types (D-05):** feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert — all defaults from `@commitlint/config-conventional`.

**Merge commit handling (D-03):** `@commitlint/config-conventional` ignores merge commits by default via the `ignores` rule (`isIgnored` function checks for merge commit patterns). No extra configuration needed.

**Worktree support (D-04):** Husky v9 uses a simple shell script approach. The `.husky/` directory lives in the repo root and is shared across worktrees because worktrees share the same `.git` hooks path. The `prepare` script runs `husky` which sets `core.hooksPath` to `.husky`. This works across worktrees natively.

**Key finding:** Use `pnpm dlx commitlint --edit $1` (not `npx --no -- commitlint --edit $1`) for pnpm-managed projects. The `pnpm dlx` approach ensures the pnpm-installed binary is found correctly.

### 2.2 Release Please GitHub Action (REL-02, REL-03, REL-04)

**Action:** `googleapis/release-please-action@v4`

**Workflow file:** `.github/workflows/release-please.yml`
```yaml
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

name: Release Please

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: node
```

**How it works:**
1. On every push to `main`, Release Please parses conventional commits since the last release
2. If releasable commits exist (`feat:`, `fix:`, etc.), it opens/updates a release PR
3. The release PR updates `package.json` version, `CHANGELOG.md`, and shows release notes
4. When the release PR is merged, Release Please creates a GitHub Release with semver tag (e.g., `v1.3.0`)

**Configuration files (optional but recommended for D-06, D-07):**

`release-please-config.json`:
```json
{
  "release-type": "node",
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" }
  ],
  "packages": {
    ".": {}
  }
}
```

`.release-please-manifest.json`:
```json
{
  ".": "1.2.0"
}
```

The manifest file tells Release Please the current version. Setting it to `1.2.0` (D-01) means the first release will compute the next version from commits since the bootstrap point.

**Permissions:** The action needs `contents: write` (for tags and releases) and `pull-requests: write` (for creating/updating the release PR). Uses `GITHUB_TOKEN` which is automatically available.

**Changelog sections (D-06):** By default Release Please includes feat, fix, and several other types. To restrict CHANGELOG.md to only `feat` and `fix`, explicitly set `changelog-sections` in config. Other commit types are still parsed for version bumping but excluded from the changelog.

### 2.3 Version Bootstrap (REL-05, D-01, D-02)

**Current state:**
- `package.json` version: `0.1.0`
- Existing git tags: `v1.0`, `v1.1` (no `v1.2.0`)
- Target bootstrap version: `1.2.0`
- Bootstrap commit: `a3a0b2d` (v1.2 completion — "chore: complete v1.2 CI & Data Integrity milestone")

**Steps:**
1. Update `package.json` version from `0.1.0` to `1.2.0`
2. Create git tag `v1.2.0` at commit `a3a0b2d`
3. Set `.release-please-manifest.json` to `{ ".": "1.2.0" }`

**Note on `bootstrap-sha`:** The `release-please-config.json` supports a `"bootstrap-sha"` field that tells Release Please to ignore commits before that SHA. This is an alternative to creating a tag but the tag approach (D-02) is more standard and provides a visible anchor in the git history.

**Approach decision:** Use both — create the `v1.2.0` tag AND set `bootstrap-sha` in the config for belt-and-suspenders reliability. Release Please looks for the last tag matching the version pattern. If `v1.2.0` tag exists at `a3a0b2d`, it will compute the next release from commits after that point.

### 2.4 Replacing version-bump.yml (REL-06)

**Current `version-bump.yml` behavior:**
- Triggers on push to main
- Parses commit message for `[major]`, `[minor]`, `[patch]` keywords
- Runs `npm version` to bump `package.json`
- Commits and pushes the version bump

**Replacement:** Delete `version-bump.yml` entirely. Release Please handles version bumping through its release PR mechanism. The commit-and-push pattern in version-bump.yml is replaced by Release Please's PR-based approach, which is cleaner (no bot commits on main) and more visible (version bumps are reviewed).

## 3. Validation Architecture

### Test Strategy

| What | How | Automated? |
|------|-----|------------|
| Commitlint rejects bad messages | `echo "bad message" \| pnpm dlx commitlint` exits non-zero | Yes (local) |
| Commitlint accepts good messages | `echo "feat: valid" \| pnpm dlx commitlint` exits zero | Yes (local) |
| Husky hook fires on commit | Attempt `git commit -m "bad"` → rejected | Yes (local) |
| Merge commits pass | `git merge --no-ff` produces valid merge commit → accepted | Yes (local) |
| Release Please config valid | `release-please-config.json` and manifest pass JSON parsing | Yes (CI check) |
| version-bump.yml removed | File does not exist | Yes (file check) |
| package.json version = 1.2.0 | `node -p "require('./package.json').version"` outputs `1.2.0` | Yes |
| v1.2.0 tag exists | `git tag -l v1.2.0` returns result | Yes |
| Release Please workflow syntax | GitHub Actions validates on push | Yes (CI) |

### Verification Commands
```bash
# Commitlint validation
echo "bad message" | pnpm dlx commitlint && echo "FAIL" || echo "PASS: bad rejected"
echo "feat: add feature" | pnpm dlx commitlint && echo "PASS: good accepted" || echo "FAIL"

# Package version
node -p "require('./package.json').version === '1.2.0'"

# Tag exists
git tag -l v1.2.0 | grep -q v1.2.0

# version-bump.yml removed
test ! -f .github/workflows/version-bump.yml

# Release Please config valid
node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('.release-please-manifest.json','utf8'))"
```

## 4. Dependencies and Integration Points

- **Existing CI (`ci.yml`):** No conflict. CI runs on `pull_request` to main; Release Please runs on `push` to main. They trigger on different events.
- **Phase 28 (Staging):** Inherits clean version state from Release Please. No dependency on Phase 27's workflow files — just needs `package.json` version to be accurate.
- **Phase 30 (Observability):** Reads `package.json` version managed by Release Please. Depends on Phase 27 completing first.
- **GSD workflow:** Claude Code agents already use conventional commit format. The commitlint hook formalizes this — agents won't be broken by it.

## 5. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Husky hook not firing in CI | Low | Low | CI doesn't need local hooks — commitlint runs locally only. Release Please validates commit format server-side by design. |
| Release Please not recognizing existing commits | Medium | Medium | Set both `bootstrap-sha` and `v1.2.0` tag as belt-and-suspenders |
| pnpm compatibility issue with husky | Low | Medium | Husky v9 has first-class pnpm support; `prepare` script works with pnpm |
| Existing `v1.0`/`v1.1` tags conflict with Release Please | Low | Low | Release Please uses the manifest version, not tag scanning. Tags `v1.0`/`v1.1` don't match semver pattern `v1.2.0` anyway. |

## 6. Implementation Order

1. **Version bootstrap** — Update package.json, create v1.2.0 tag, create Release Please config files
2. **Commitlint + husky** — Install packages, create config, set up hooks
3. **Release Please workflow** — Create workflow file, delete version-bump.yml
4. **Verification** — Test all components locally and validate config

This order ensures the version anchor is in place before Release Please is activated, and commit hooks are ready before the workflow goes live.

---

## RESEARCH COMPLETE
