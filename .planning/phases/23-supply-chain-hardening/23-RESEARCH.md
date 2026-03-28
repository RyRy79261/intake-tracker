# Phase 23: Supply Chain Hardening - Research

**Researched:** 2026-03-28
**Domain:** pnpm supply chain security configuration + CI audit gates
**Confidence:** HIGH

## Summary

Phase 23 adds three pnpm security settings (`minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`) to `pnpm-workspace.yaml` and creates a `supply-chain` CI job that runs `pnpm audit` and verifies config drift. All three settings are supported by the project's current pnpm 10.30.2 (introduced in 10.16, 10.21, and 10.26 respectively). The `auditLevel` setting can also be configured in `pnpm-workspace.yaml` (added in 10.29).

**Critical correction:** The CONTEXT.md D-06 states the config drift check should grep `.npmrc` for the 3 security settings. However, **these settings belong in `pnpm-workspace.yaml`, NOT `.npmrc`**. The `.npmrc` file is only for auth/registry settings. The drift check must grep `pnpm-workspace.yaml` instead.

**Existing vulnerability situation:** The current codebase has 56 audit findings (2 critical, 29 high, 22 moderate, 3 low). Per D-02, critical/high must be resolved before the PR merges. The two critical vulns (`next@14.2.15` and `jspdf@4.2.0`) are direct dependencies with available patches (`next@14.2.35` and `jspdf@4.2.1`). Many high-severity findings are deeply transitive (via `next-pwa`, `@privy-io/react-auth`, `eslint`) and will require `pnpm.overrides` or `pnpm audit --fix` to resolve.

**Primary recommendation:** Add security settings to `pnpm-workspace.yaml`, bump direct deps (`next`, `jspdf`), run `pnpm audit --fix` for transitive overrides, then add the `supply-chain` CI job with audit + drift check steps.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `pnpm audit` fails CI on **critical and high** severity vulnerabilities only. Low/moderate in transitive deps are noise with no actionable fix.
- **D-02:** Any existing critical/high vulnerabilities must be **fixed before the Phase 23 PR merges**. No allowlists, no warn-only mode. Run `pnpm audit` during implementation and resolve findings as part of phase work.
- **D-03:** The 24h `minimumReleaseAge` rule has **no override or escape hatch**. Manual pinning/patching for true emergencies.
- **D-04:** New dedicated `supply-chain` job in `ci.yml`, added to the `ci-pass` gate's `needs` list. Follows established Phase 20 job pattern.
- **D-05:** `pnpm audit` checks **all dependencies** (prod + dev). Supply chain attacks often target build tooling.
- **D-06:** A CI step in the `supply-chain` job greps for the 3 required security settings. Fails with actionable error if missing. **CORRECTION: grep `pnpm-workspace.yaml`, not `.npmrc` (settings live in workspace config).**

### Claude's Discretion
- Exact `pnpm audit` CLI flags for severity filtering (e.g., `--audit-level`)
- Order of steps within the supply-chain CI job
- Whether config drift check is a shell script step or a separate test file
- Exact `.npmrc` setting values for `minimumReleaseAge` (1440 from requirements, but verify pnpm 10.x syntax)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHN-01 | pnpm enforces 24h minimum package age via `minimumReleaseAge=1440` | Setting confirmed in pnpm 10.16+. Goes in `pnpm-workspace.yaml` as `minimumReleaseAge: 1440` (minutes). Supported by pnpm 10.30.2. |
| SCHN-02 | pnpm `trustPolicy=no-downgrade` detects compromised publisher accounts | Setting confirmed in pnpm 10.21+. Goes in `pnpm-workspace.yaml` as `trustPolicy: no-downgrade`. Supported by pnpm 10.30.2. |
| SCHN-03 | pnpm `blockExoticSubdeps=true` prevents git/tarball transitive dependencies | Setting confirmed in pnpm 10.26+. Goes in `pnpm-workspace.yaml` as `blockExoticSubdeps: true`. Supported by pnpm 10.30.2. |
| SCHN-04 | `pnpm audit` runs in CI and fails on known vulnerabilities | `pnpm audit --audit-level high` returns exit code 1 when high/critical vulns found. Can also set `auditLevel: high` in `pnpm-workspace.yaml` (10.29+). CI job follows Phase 20 pattern. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (enforced via `preinstall` hook; npm/yarn will fail)
- pnpm version: `10.30.2` (from `packageManager` field in `package.json`)
- Existing CI uses: `actions/checkout@v4`, `pnpm/action-setup@v5`, `actions/setup-node@v4` with Node 20 and pnpm cache
- `--frozen-lockfile` on all CI installs
- Never start the dev server (user runs `pnpm dev` themselves)

## Standard Stack

### Core
| Setting | Location | Value | Why Standard |
|---------|----------|-------|--------------|
| `minimumReleaseAge` | `pnpm-workspace.yaml` | `1440` | pnpm's built-in 24h quarantine for new packages; blocks rushed malicious publishes |
| `trustPolicy` | `pnpm-workspace.yaml` | `no-downgrade` | pnpm's built-in trust regression detector; catches compromised accounts |
| `blockExoticSubdeps` | `pnpm-workspace.yaml` | `true` | pnpm's built-in exotic source blocker; prevents git/tarball subdeps |
| `auditLevel` | `pnpm-workspace.yaml` | `high` | Persists severity threshold; `pnpm audit` returns non-zero only on high/critical |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `pnpm audit` | built-in (10.30.2) | Vulnerability scanning | CI supply-chain job, pre-merge gate |
| `pnpm audit --fix` | built-in | Auto-generate overrides for transitive vulns | One-time during implementation to fix existing vulns |
| `pnpm.overrides` | pnpm-workspace.yaml | Force safe transitive dep versions | When parent packages lag behind patches |

### No New Dependencies
Zero additional npm packages needed. All features are built into pnpm 10.30.2.

## Architecture Patterns

### Configuration File Changes

**`pnpm-workspace.yaml`** (the ONLY file for security settings):
```yaml
onlyBuiltDependencies:
  - '@reown/appkit'

# Supply chain security (Phase 23)
minimumReleaseAge: 1440
trustPolicy: no-downgrade
blockExoticSubdeps: true
auditLevel: high
```

**NOT `.npmrc`** -- `.npmrc` is only for auth/registry settings in pnpm 10.x. The three security settings and `auditLevel` all belong in `pnpm-workspace.yaml`.

### CI Job Pattern (follows Phase 20 established pattern)

```yaml
supply-chain:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v5
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - name: Verify supply chain config
      run: |
        echo "Checking pnpm-workspace.yaml for required security settings..."
        missing=0
        for setting in minimumReleaseAge trustPolicy blockExoticSubdeps; do
          if ! grep -q "^${setting}:" pnpm-workspace.yaml; then
            echo "::error::Missing required security setting: ${setting} in pnpm-workspace.yaml"
            missing=1
          fi
        done
        if [ "$missing" -eq 1 ]; then
          exit 1
        fi
        echo "All supply chain settings present"
    - name: Audit dependencies
      run: pnpm audit --audit-level high
```

### ci-pass Gate Update

```yaml
ci-pass:
  if: always()
  needs: [lint, typecheck, test-tz-sa, test-tz-de, build, data-integrity, e2e, supply-chain]
  runs-on: ubuntu-latest
  steps:
    - name: Check all jobs passed
      run: |
        if [[ "${{ needs.lint.result }}" != "success" ||
              "${{ needs.typecheck.result }}" != "success" ||
              "${{ needs.test-tz-sa.result }}" != "success" ||
              "${{ needs.test-tz-de.result }}" != "success" ||
              "${{ needs.build.result }}" != "success" ||
              "${{ needs.data-integrity.result }}" != "success" ||
              "${{ needs.e2e.result }}" != "success" ||
              "${{ needs.supply-chain.result }}" != "success" ]]; then
          echo "::error::One or more CI jobs failed or were cancelled"
          exit 1
        fi
```

### Anti-Patterns to Avoid
- **Settings in `.npmrc`:** These three settings ONLY work in `pnpm-workspace.yaml`. Putting them in `.npmrc` silently has no effect.
- **Using `--prod` flag with audit:** D-05 explicitly requires scanning ALL deps (prod + dev) since compromised dev deps can inject into builds.
- **Using `pnpm audit --fix` without reviewing:** The `--fix` flag writes overrides; always review what it generates to avoid unintended side effects.
- **Ignoring transitive vulns wholesale:** `--ignore-unfixable` should NOT be used in CI; all current vulns have resolutions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package age quarantine | Custom publish-date checker | `minimumReleaseAge: 1440` | Built into pnpm, checks registry metadata, handles all packages |
| Publisher trust verification | Custom provenance checker | `trustPolicy: no-downgrade` | pnpm tracks trust levels across versions automatically |
| Exotic subdep blocking | Custom lockfile parser | `blockExoticSubdeps: true` | pnpm resolves this at install time, covers all edge cases |
| Vulnerability scanning | Custom advisory DB checker | `pnpm audit --audit-level high` | Uses npm registry advisory DB, maintained by GitHub/npm team |
| Config drift detection | Custom YAML parser test | Simple `grep` in CI step | Three string checks; a test file adds unnecessary complexity |

**Key insight:** All supply chain protections are built into pnpm 10.x. This phase is purely configuration -- no custom code needed.

## Common Pitfalls

### Pitfall 1: Settings in Wrong File
**What goes wrong:** Adding `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps` to `.npmrc` instead of `pnpm-workspace.yaml`. Settings silently do nothing.
**Why it happens:** The CONTEXT.md D-06 mentions `.npmrc` (from the discussion phase), but pnpm 10.x moved these to workspace config. Older documentation/blog posts may reference `.npmrc`.
**How to avoid:** All three settings go in `pnpm-workspace.yaml`. Only auth/registry settings go in `.npmrc`.
**Warning signs:** Settings don't appear in `pnpm config list` output; `pnpm install` of a brand-new package succeeds immediately.

### Pitfall 2: Existing Vulnerabilities Block CI
**What goes wrong:** Adding the audit CI step before fixing existing vulns. Every PR fails even though nothing changed.
**Why it happens:** The project currently has 2 critical + 29 high severity findings.
**How to avoid:** Fix existing vulns FIRST (bump `next` to 14.2.35, `jspdf` to 4.2.1, add overrides for transitive deps), THEN add the CI gate.
**Warning signs:** CI fails immediately on first PR with pre-existing findings.

### Pitfall 3: `next-pwa` Transitive Vulnerability Cascade
**What goes wrong:** Many high-severity findings trace through `next-pwa` (minimatch, rollup, serialize-javascript, brace-expansion). `next-pwa` is unmaintained (last publish 2022).
**Why it happens:** `next-pwa@5.6.0` depends on old workbox/webpack versions with known vulns.
**How to avoid:** Use `pnpm.overrides` in `pnpm-workspace.yaml` to pin safe versions of transitive deps. Don't try to upgrade `next-pwa` itself (it may break).
**Warning signs:** `pnpm audit --fix` generates many overrides for `next-pwa` subtree.

### Pitfall 4: `trustPolicy` Blocks Legitimate Installs
**What goes wrong:** `trustPolicy: no-downgrade` may block installing a package if its trust level decreased (e.g., a maintainer stopped signing).
**Why it happens:** Trust is evaluated against the full publish history; a new maintainer without provenance signatures triggers a downgrade.
**How to avoid:** Use `trustPolicyExclude` to whitelist specific packages that legitimately lack trust continuity. Keep it minimal.
**Warning signs:** `pnpm install` fails with trust-related error after adding `trustPolicy: no-downgrade`.

### Pitfall 5: `pnpm audit --fix` Overrides Format Changed
**What goes wrong:** In recent pnpm versions (10.28+), `pnpm audit --fix` writes overrides to `pnpm-workspace.yaml` instead of `package.json`. This is actually correct behavior for pnpm 10.x but may surprise developers.
**Why it happens:** pnpm 10 moved overrides from `package.json#pnpm.overrides` to `pnpm-workspace.yaml#overrides`.
**How to avoid:** Run `pnpm audit --fix`, then verify overrides landed in `pnpm-workspace.yaml`. Commit both `pnpm-workspace.yaml` and `pnpm-lock.yaml`.
**Warning signs:** Overrides appear in unexpected file; lockfile not updated.

## Code Examples

### pnpm-workspace.yaml with All Security Settings
```yaml
# Source: https://pnpm.io/settings + https://pnpm.io/supply-chain-security
onlyBuiltDependencies:
  - '@reown/appkit'

# Supply chain security
minimumReleaseAge: 1440
trustPolicy: no-downgrade
blockExoticSubdeps: true
auditLevel: high
```

### Config Drift Check (Shell Step)
```bash
# Source: Custom pattern following D-06, corrected for pnpm-workspace.yaml
echo "Checking pnpm-workspace.yaml for required security settings..."
missing=0
for setting in minimumReleaseAge trustPolicy blockExoticSubdeps; do
  if ! grep -q "^${setting}:" pnpm-workspace.yaml; then
    echo "::error::Missing required security setting: ${setting} in pnpm-workspace.yaml"
    missing=1
  fi
done
if [ "$missing" -eq 1 ]; then
  echo "Add the missing settings to pnpm-workspace.yaml. See Phase 23 docs."
  exit 1
fi
echo "All supply chain settings present"
```

### pnpm audit in CI
```bash
# Source: https://pnpm.io/cli/audit
# --audit-level high: exit code 1 only on high/critical findings
# No --prod flag: scans all deps (D-05)
# No --ignore-unfixable: all current vulns have resolutions
pnpm audit --audit-level high
```

### Fixing Existing Vulnerabilities
```bash
# Step 1: Bump direct deps with available patches
pnpm update next@14.2.35 jspdf@4.2.1

# Step 2: Auto-generate overrides for transitive deps
pnpm audit --fix

# Step 3: Reinstall with overrides applied
pnpm install

# Step 4: Verify remaining findings
pnpm audit --audit-level high
```

### Override Syntax for Transitive Deps
```yaml
# Source: https://pnpm.io/settings#overrides
# In pnpm-workspace.yaml
overrides:
  "minimatch@<3.1.4": "3.1.4"
  "serialize-javascript@<=7.0.2": "7.0.3"
  "flatted@<=3.4.1": "3.4.2"
```

## Existing Vulnerability Inventory

### Critical (2) -- Direct deps, must fix
| Package | Current | Patched | Path | Fix Strategy |
|---------|---------|---------|------|--------------|
| next | 14.2.15 | >=14.2.25 | direct dep | Bump to 14.2.35 (latest 14.x) |
| jspdf | 4.2.0 | >=4.2.1 | direct dep | Bump to 4.2.1 |

### High (29) -- Mix of direct and transitive
| Root Cause | Count | Path Pattern | Fix Strategy |
|------------|-------|-------------|--------------|
| next (DoS, SSRF) | 3 | direct | Bump to 14.2.35 |
| minimatch (ReDoS) | 12 | via eslint, next-pwa, eslint-config-next | Override to patched versions |
| next-pwa subtree | 3 | rollup, serialize-javascript, brace-expansion | Override transitive deps |
| @privy-io/react-auth | 4 | hono, h3, socket.io-parser, axios | Override transitive deps |
| eslint subtree | 2 | flatted, glob | Override transitive deps |
| picomatch (ReDoS) | 2 | via tailwindcss, eslint-config-next | Override to patched versions |
| jspdf (PDF injection) | 1 | direct | Bump to 4.2.1 |
| serialize-javascript | 2 | via babel-loader, next-pwa | Override to 7.0.3 |

### Fix Strategy Summary
1. **Bump direct deps:** `next@14.2.35`, `jspdf@4.2.1` -- resolves 7 findings (2 critical + 5 high)
2. **Run `pnpm audit --fix`:** auto-generates overrides for remaining transitive vulns
3. **Manual review:** verify overrides don't break builds; run `pnpm build` after

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Security settings in `.npmrc` | Settings in `pnpm-workspace.yaml` | pnpm 10.x (2025) | `.npmrc` is auth-only; workspace config is the canonical location |
| `overrides` in `package.json#pnpm` | `overrides` in `pnpm-workspace.yaml` | pnpm 10.x (2025) | `pnpm audit --fix` now writes to workspace config |
| `--audit-level` CLI-only | `auditLevel` in workspace config | pnpm 10.29 (2025) | Persistent config, no flag needed on every invocation |
| No package age protection | `minimumReleaseAge` | pnpm 10.16 (Sep 2025) | 24h quarantine is now a first-class pnpm feature |
| No trust tracking | `trustPolicy: no-downgrade` | pnpm 10.21 (2025) | Publisher trust regression detection built-in |
| No exotic subdep blocking | `blockExoticSubdeps: true` | pnpm 10.26 (2025) | Will become default in pnpm 11 |

## Open Questions

1. **`trustPolicy` compatibility with existing lockfile**
   - What we know: Adding `trustPolicy: no-downgrade` only affects future installs, not existing lockfile entries
   - What's unclear: Whether `pnpm install --frozen-lockfile` in CI could fail if trust metadata is missing for already-locked packages
   - Recommendation: Add the setting, run `pnpm install` locally first to verify, resolve any `trustPolicyExclude` entries needed

2. **`next-pwa` long-term maintenance**
   - What we know: `next-pwa@5.6.0` is the source of many transitive vulns (minimatch, rollup, serialize-javascript). It hasn't been published since 2022.
   - What's unclear: Whether overrides for its subtree will hold long-term or accumulate
   - Recommendation: Overrides are fine for this phase. Consider replacing `next-pwa` with `@serwist/next` or `next-pwa-ts` in a future phase (out of scope for Phase 23).

3. **Remaining moderate/low vulns after fixes**
   - What we know: D-01 only gates on high/critical. After fixing those, 25 moderate/low findings will remain
   - What's unclear: Whether any moderate findings will be promoted to high over time
   - Recommendation: Accept moderate/low as noise per D-01. Monitor via periodic manual `pnpm audit` runs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm exec vitest run src/__tests__/integrity/` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHN-01 | `minimumReleaseAge: 1440` present in workspace config | smoke (CI grep) | `grep -q "^minimumReleaseAge:" pnpm-workspace.yaml` | N/A (CI step) |
| SCHN-02 | `trustPolicy: no-downgrade` present in workspace config | smoke (CI grep) | `grep -q "^trustPolicy:" pnpm-workspace.yaml` | N/A (CI step) |
| SCHN-03 | `blockExoticSubdeps: true` present in workspace config | smoke (CI grep) | `grep -q "^blockExoticSubdeps:" pnpm-workspace.yaml` | N/A (CI step) |
| SCHN-04 | `pnpm audit` passes at high severity level | integration (CI) | `pnpm audit --audit-level high` | N/A (CI step) |

### Sampling Rate
- **Per task commit:** Verify settings with `grep` + run `pnpm audit --audit-level high` locally
- **Per wave merge:** Full CI suite including new `supply-chain` job
- **Phase gate:** `pnpm audit --audit-level high` returns exit code 0; all 3 settings present in `pnpm-workspace.yaml`

### Wave 0 Gaps
None -- this phase uses CI job steps (shell grep + pnpm audit), not Vitest test files. No new test infrastructure needed.

## Sources

### Primary (HIGH confidence)
- [pnpm Settings (pnpm-workspace.yaml)](https://pnpm.io/settings) -- Official docs for `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`, `overrides`, `auditLevel`
- [pnpm CLI: audit](https://pnpm.io/cli/audit) -- Official docs for `--audit-level`, `--fix`, `--ignore-unfixable`, `--ignore`, exit code behavior
- [pnpm Supply Chain Security](https://pnpm.io/supply-chain-security) -- Official security guide
- [pnpm Auth & Registry Settings (.npmrc)](https://pnpm.io/npmrc) -- Confirms `.npmrc` is auth-only
- `pnpm audit --help` (local, v10.30.2) -- Verified all flags match docs
- `pnpm audit` (local) -- Confirmed 56 vulns (2 critical, 29 high), exit code 1

### Secondary (MEDIUM confidence)
- [pnpm 10.16 release](https://pnpm.io/blog/releases/10.16) -- `minimumReleaseAge` introduction
- [pnpm 10.21 release](https://pnpm.io/blog/releases/10.21) -- `trustPolicy` introduction
- [pnpm 10.26 release](https://pnpm.io/blog/releases/10.26) -- `blockExoticSubdeps` introduction
- [pnpm 10.29 release](https://pnpm.io/blog/releases/10.29) -- `auditLevel` in workspace config
- [Socket.dev: pnpm 10.16 analysis](https://socket.dev/blog/pnpm-10-16-adds-new-setting-for-delayed-dependency-updates) -- Independent analysis of minimumReleaseAge

### Tertiary (LOW confidence)
- [GitHub issue #10472](https://github.com/pnpm/pnpm/issues/10472) -- `pnpm audit --fix` writes to pnpm-workspace.yaml (confirmed behavior, not a bug)
- [GitHub issue #10202](https://github.com/pnpm/pnpm/issues/10202) -- `no-downgrade` checks same major version (edge case awareness)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All settings verified in official pnpm docs and confirmed available in 10.30.2
- Architecture: HIGH -- CI job pattern directly mirrors 7 existing jobs; pnpm-workspace.yaml format verified
- Pitfalls: HIGH -- Vulnerability inventory from live `pnpm audit` output; settings location verified against official docs
- Vulnerability fixes: MEDIUM -- Direct dep bumps are straightforward; transitive override strategy needs validation during implementation

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (pnpm settings are stable; vulnerability inventory may change with new advisories)
