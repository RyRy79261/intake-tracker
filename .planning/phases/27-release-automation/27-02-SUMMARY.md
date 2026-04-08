---
phase: 27-release-automation
plan: 02
subsystem: infra
tags: [commitlint, husky, git-hooks, conventional-commits]

requires: []
provides:
  - commitlint with @commitlint/config-conventional preset
  - husky v9 commit-msg hook enforcing conventional commit format
  - pre-commit hook running pnpm test
affects: [27-03]

tech-stack:
  added: [@commitlint/cli@20.5.0, @commitlint/config-conventional@20.5.0, husky@9.1.7]
  patterns: [conventional-commits, git-hooks-via-husky]

key-files:
  created:
    - commitlint.config.js
    - .husky/commit-msg
    - .husky/pre-commit
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Used module.exports (CJS) syntax in commitlint.config.js — project has no type:module in package.json"
  - "Used pnpm dlx commitlint (not npx) in hook for pnpm compatibility"
  - "Kept default pre-commit hook from husky init (runs pnpm test)"

patterns-established:
  - "Git hooks via husky v9: .husky/ directory with simple shell scripts, no shebang needed"
  - "Conventional commit enforcement: commitlint validates on every commit via commit-msg hook"

requirements-completed: [REL-01]

duration: 3min
completed: 2026-04-04
---

# Plan 27-02: Commitlint & Husky Commit Hook Summary

**Installed commitlint + husky and enforced conventional commit format via commit-msg hook — bad messages are rejected before commit creation**

## Performance

- **Duration:** 3 min
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

1. Installed `@commitlint/cli@20.5.0`, `@commitlint/config-conventional@20.5.0`, and `husky@9.1.7` as devDependencies
2. Created `commitlint.config.js` with conventional commit preset (CJS syntax)
3. Created `.husky/commit-msg` hook calling `pnpm dlx commitlint --edit $1`
4. Verified: `git commit -m "bad message"` is rejected with proper error messages
5. Verified: all standard conventional commit types (feat, fix, docs, etc.) are accepted

## Verification

- `echo "feat: test" | pnpm dlx commitlint` exits 0
- `echo "invalid" | pnpm dlx commitlint` exits 1 with `subject-empty` and `type-empty` errors
- `git commit --allow-empty -m "bad message"` rejected by commit-msg hook
- `.husky/commit-msg` contains `pnpm dlx commitlint --edit $1`
- `commitlint.config.js` contains `extends: ['@commitlint/config-conventional']`
- All 396 existing tests pass

## Issues Encountered

None.

## Self-Check: PASSED
