# Phase 22: E2E Testing in CI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 22-e2e-testing-in-ci
**Areas discussed:** Scenario coverage, Dev vs prod server, Test organization, CI job config

---

## Scenario Coverage

### Composable Entry Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Food+liquid with AI | Full composable flow: food AI parse + liquid preset, both with verification | ✓ |
| Food only | Just food composable flow, skip liquid preset testing | |
| Minimal confirm | Keep existing water/salt, add one food entry with mocked AI | |

**User's choice:** Food+liquid with AI
**Notes:** Food flow: enter description → mock AI parse → verify preview with linked entries → confirm. Liquid flow: select preset → verify substance auto-calc → confirm.

### Medication Dose Logging Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Create + log dose | Extend wizard test: create medication → navigate to detail → log dose → verify history + inventory | ✓ |
| Log dose only | Seed IndexedDB directly, test only dose logging interaction | |
| Full lifecycle + retroactive | Create → log dose → verify → also test retroactive dose logging | |

**User's choice:** Create + log dose
**Notes:** Full lifecycle from prescription creation through dose logging and inventory verification.

### Settings Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Theme + day-start | Toggle theme, change day-start-hour, reload, verify both persist | ✓ |
| All key settings | Theme, day-start, water/salt increments and limits | |
| Theme only | Minimal — just toggle theme, reload, verify | |

**User's choice:** Theme + day-start
**Notes:** Covers Zustand/localStorage persistence mechanism without being overly broad.

---

## Dev vs Prod Server

| Option | Description | Selected |
|--------|-------------|----------|
| Dual config | Dev server locally, prod build in CI via process.env.CI switch in playwright.config.ts | ✓ |
| Always prod build | Switch to pnpm build && pnpm start everywhere | |
| Separate config files | playwright.config.ts for local, playwright.ci.config.ts for CI | |

**User's choice:** Dual config
**Notes:** Best of both worlds — fast local iteration with dev server, prod-accurate CI runs.

---

## Test Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Evolve existing files | Expand intake-logs.spec.ts and medication-wizard.spec.ts, add settings.spec.ts | ✓ |
| New test files only | Leave existing untouched, add 3 new files | |
| Full rewrite | Delete existing, write 3 clean spec files | |

**User's choice:** Evolve existing files
**Notes:** auth-bypass stays as-is, intake-logs expands with food+liquid, medication-wizard expands with dose logging, new settings.spec.ts.

---

## CI Job Config

### Build Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Independent build | E2E job builds internally via Playwright webServer, runs parallel with other jobs | ✓ |
| Depends on build job | Sequential — downloads .next/ artifact from build job | |
| Shared build matrix | Refactor build into shared step for both bundle-security and E2E | |

**User's choice:** Independent build
**Notes:** Simpler config, full parallelism with other CI jobs.

### Failure Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Traces on failure | Upload Playwright traces via actions/upload-artifact@v4, 7-day retention | ✓ |
| No artifacts | Just pass/fail, debug from logs | |
| Full report | Upload HTML report on every run | |

**User's choice:** Traces on failure
**Notes:** Small artifact size, useful for debugging CI-only failures.

---

## Claude's Discretion

- Browser install caching strategy
- Retry count and timeout values
- Script naming (`test:e2e` vs `test:e2e:ci`)
- Production server port

## Deferred Ideas

None — discussion stayed within phase scope.
