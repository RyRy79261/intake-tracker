# Phase 27: Release Automation - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the fragile keyword-based `version-bump.yml` with a proper Release Please pipeline. Add commitlint + husky for conventional commit enforcement. Produce changelogs, semver tags, and GitHub Releases automatically on every merge to main.

</domain>

<decisions>
## Implementation Decisions

### Version Bootstrap
- **D-01:** Set `package.json` version to `1.2.0` before activating Release Please — aligns with last shipped milestone (v1.2 CI & Data Integrity)
- **D-02:** Create a retroactive `v1.2.0` git tag at commit `a3a0b2d` (v1.2 completion commit) as the historical anchor point for Release Please

### Commit Hook Behavior
- **D-03:** Enforce commitlint on all commits, auto-ignore merge commits — strict validation with standard merge-commit exception
- **D-04:** Apply the hook everywhere including worktrees — Claude Code agents already use conventional format, hook validates consistency
- **D-05:** Allow the full standard conventional commit type set: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert (`@commitlint/config-conventional` defaults)

### Changelog Content
- **D-06:** Only `feat` and `fix` commits appear in CHANGELOG.md — clean, user-focused changelog with low noise (Release Please default)
- **D-07:** GitHub Release notes are auto-generated from the same source as CHANGELOG entries — zero manual effort, consistent

### Claude's Discretion
- Release Please configuration details (release-type, token permissions, workflow triggers)
- Exact husky + commitlint installation approach (pnpm compatibility)
- Whether to seed CHANGELOG.md with a v1.2.0 retroactive section or start fresh
- CI workflow file naming and organization

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CI/Release infrastructure
- `.github/workflows/version-bump.yml` — Current version bumping workflow to be replaced (REL-06)
- `.github/workflows/ci.yml` — Existing CI pipeline; new release workflow must not conflict
- `package.json` — Current version field (`0.1.0`) to be updated to `1.2.0` (REL-05)
- `.npmrc` — pnpm configuration (engine-strict, auto-install-peers)

### Requirements
- `.planning/REQUIREMENTS.md` — REL-01 through REL-06 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Conventional commit format already in use across all recent commits (`docs:`, `feat:`, `test:`, `chore:`) — hook enforcement formalizes existing practice
- CI uses pnpm/action-setup@v5 + actions/setup-node@v4 with Node 22 and pnpm cache — new workflow should follow same pattern

### Established Patterns
- CI runs on `pull_request` to `main` with path-based filtering (dorny/paths-filter)
- Workflows use `ubuntu-latest` runners with `pnpm install --frozen-lockfile`
- `version-bump.yml` runs on `push` to `main` — Release Please workflow replaces this trigger

### Integration Points
- Release Please workflow triggers on push to `main` (same as current version-bump.yml)
- Phase 28 (Staging) inherits clean version state from Release Please
- Phase 30 (Observability) reads `package.json` version managed by Release Please

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-release-automation*
*Context gathered: 2026-04-04*
