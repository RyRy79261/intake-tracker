---
phase: 27
slug: release-automation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell commands + node -e assertions |
| **Config file** | none — commitlint.config.js created in this phase |
| **Quick run command** | `echo "feat: test" | pnpm dlx commitlint` |
| **Full suite command** | `pnpm lint && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `echo "feat: test" | pnpm dlx commitlint`
- **After every plan wave:** Run `pnpm lint && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | REL-05 | — | N/A | integration | `node -p "require('./package.json').version === '1.2.0'"` | ✅ | ⬜ pending |
| 27-01-02 | 01 | 1 | REL-05 | — | N/A | integration | `git tag -l v1.2.0 \| grep -q v1.2.0` | ✅ | ⬜ pending |
| 27-02-01 | 02 | 1 | REL-01 | — | N/A | integration | `echo "bad message" \| pnpm dlx commitlint; test $? -ne 0` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 1 | REL-01 | — | N/A | integration | `echo "feat: valid" \| pnpm dlx commitlint` | ❌ W0 | ⬜ pending |
| 27-03-01 | 03 | 2 | REL-02, REL-06 | — | N/A | file check | `test -f .github/workflows/release-please.yml && test ! -f .github/workflows/version-bump.yml` | ✅ | ⬜ pending |
| 27-03-02 | 03 | 2 | REL-03 | — | N/A | file check | `node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8'))"` | ❌ W0 | ⬜ pending |
| 27-03-03 | 03 | 2 | REL-04 | — | N/A | file check | `node -e "JSON.parse(require('fs').readFileSync('.release-please-manifest.json','utf8'))"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `commitlint.config.js` — commitlint configuration (created in plan tasks)
- [ ] `.husky/commit-msg` — husky commit-msg hook (created in plan tasks)
- [ ] `release-please-config.json` — Release Please configuration (created in plan tasks)
- [ ] `.release-please-manifest.json` — Release Please manifest (created in plan tasks)

*Existing infrastructure covers lint and build. Phase-specific files created during execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Release Please opens PR on push to main | REL-02 | Requires GitHub Actions runtime | Merge a feat: commit to main, verify release PR is created |
| GitHub Release created on PR merge | REL-04 | Requires GitHub Actions runtime | Merge the release PR, verify GitHub Release with semver tag |
| CHANGELOG.md entries grouped by type | REL-03 | Requires real Release Please run | Inspect CHANGELOG.md after first release PR |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
