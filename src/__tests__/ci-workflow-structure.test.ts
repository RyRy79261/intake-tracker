/**
 * CI workflow structural validation — verifies that ci.yml enforces the
 * required gate contract for PRs to main (CIPL-01, CIPL-02, CIPL-03).
 *
 * Behavioral framing:
 *   CIPL-01: All PRs to main are gated by a single required status check
 *            (ci-pass) that depends on every other job with if:always().
 *   CIPL-02: The build job runs a bundle security scan AFTER the production
 *            build so secrets cannot leak into the client bundle.
 *   CIPL-03: Unit tests execute in both Africa/Johannesburg and Europe/Berlin
 *            timezones as separate parallel jobs.
 *
 * Run with: pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CI_YML_PATH = path.resolve(process.cwd(), ".github/workflows/ci.yml");

let raw: string;

beforeAll(() => {
  if (!fs.existsSync(CI_YML_PATH)) {
    throw new Error(`ci.yml not found at ${CI_YML_PATH}`);
  }
  raw = fs.readFileSync(CI_YML_PATH, "utf-8");
});

// ---------------------------------------------------------------------------
// Helper: extract the indented block under a given top-level job key.
// Returns the text from "<jobName>:" through (but not including) the next
// job definition at the same indentation level, or EOF.
//
// Strategy: find the character offset of this job's header line and the next
// job header line, then slice between them.  This avoids multiline lookahead
// bugs in JS regexes where `$` in `m` mode matches end-of-line, not EOF.
// ---------------------------------------------------------------------------
function extractJobBlock(jobName: string, yaml: string): string {
  // Collect all top-level job header offsets: "  <name>:" at column 0+2 spaces
  const jobHeaderPattern = /^  ([a-z][a-z0-9-]+):/gm;
  const boundaries: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = jobHeaderPattern.exec(yaml)) !== null) {
    boundaries.push({ name: m[1]!, start: m.index });
  }

  const idx = boundaries.findIndex((b) => b.name === jobName);
  if (idx === -1) return "";

  const start = boundaries[idx]!.start;
  const end = idx + 1 < boundaries.length ? boundaries[idx + 1]!.start : yaml.length;
  return yaml.slice(start, end);
}

describe("CI workflow gates PRs with required checks (CIPL-01)", () => {
  it("workflow triggers only on pull_request to main branch", () => {
    // Requirement: every PR to main must be validated (not pushes to arbitrary branches)
    expect(raw).toContain("pull_request:");
    expect(raw).toContain("branches: [main]");
  });

  it("required check jobs are all present in the workflow", () => {
    // lint, typecheck, test-tz-sa, test-tz-de, build, and ci-pass gate must exist
    const requiredJobs = ["lint", "typecheck", "test-tz-sa", "test-tz-de", "build", "ci-pass"];
    for (const job of requiredJobs) {
      expect(raw, `job "${job}" should be defined`).toMatch(
        new RegExp(`^  ${job}:`, "m")
      );
    }
  });

  it("ci-pass gate runs even when upstream jobs fail (if: always())", () => {
    // Without if:always(), a failing job causes ci-pass to be SKIPPED,
    // and GitHub treats SKIPPED as passing for required status checks.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(ciPassBlock, "ci-pass must have 'if: always()'").toContain(
      "if: always()"
    );
  });

  it("ci-pass gate depends on all other jobs via needs", () => {
    // The gate must list every parallel job in its needs array so that
    // GitHub waits for all of them before evaluating the gate.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    const requiredNeedsJobs = [
      "lint",
      "typecheck",
      "test-tz-sa",
      "test-tz-de",
      "build",
    ];
    for (const job of requiredNeedsJobs) {
      expect(
        ciPassBlock,
        `ci-pass needs array must include "${job}"`
      ).toContain(job);
    }
  });

  it("ci-pass gate explicitly checks each unconditional job result for success", () => {
    // Using wildcard needs.*.result has a known GitHub Actions runner bug (#1540);
    // each unconditional job must be checked individually.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    const unconditionalJobs = ["lint", "typecheck", "build"];
    for (const job of unconditionalJobs) {
      // Expect explicit reference like: needs.lint.result
      expect(
        ciPassBlock,
        `ci-pass must explicitly check needs.${job}.result`
      ).toContain(`needs.${job}.result`);
    }
  });

  it("each check job uses Node 20 and frozen-lockfile install", () => {
    // Node 18 is EOL; frozen-lockfile prevents lockfile mutations in CI.
    const jobsToCheck = ["lint", "typecheck", "build"];
    for (const job of jobsToCheck) {
      const block = extractJobBlock(job, raw);
      expect(block, `${job} must use node-version: '20'`).toContain(
        "node-version: '20'"
      );
      expect(block, `${job} must use --frozen-lockfile`).toContain(
        "--frozen-lockfile"
      );
    }
  });

  it("each check job sets up pnpm via pnpm/action-setup", () => {
    // pnpm/action-setup reads packageManager from package.json automatically
    const jobsToCheck = ["lint", "typecheck", "build", "test-tz-sa", "test-tz-de"];
    for (const job of jobsToCheck) {
      const block = extractJobBlock(job, raw);
      expect(
        block,
        `${job} must use pnpm/action-setup`
      ).toContain("pnpm/action-setup");
    }
  });
});

describe("Build job runs bundle security scan after production build (CIPL-02)", () => {
  it("build job runs pnpm build before bundle security scan", () => {
    // The bundle security test reads .next/static/, which only exists after build.
    // Ordering within the build job guarantees secrets are scanned post-build.
    const buildBlock = extractJobBlock("build", raw);
    const buildPos = buildBlock.indexOf("pnpm build");
    const scanPos = buildBlock.indexOf(
      "pnpm exec vitest run src/__tests__/bundle-security.test.ts"
    );
    expect(buildPos, "pnpm build step must be present in build job").toBeGreaterThan(-1);
    expect(scanPos, "bundle security scan step must be present in build job").toBeGreaterThan(-1);
    expect(
      buildPos,
      "pnpm build must appear before bundle security scan in the build job"
    ).toBeLessThan(scanPos);
  });

  it("bundle security scan runs in the same job as the build (not a separate job)", () => {
    // A separate job would not have access to the .next/static artifacts
    // without explicit artifact upload/download steps.
    const buildBlock = extractJobBlock("build", raw);
    expect(
      buildBlock,
      "bundle-security.test.ts must be invoked within the build job block"
    ).toContain("bundle-security.test.ts");
  });
});

describe("Dual-TZ jobs execute tests in both required timezones (CIPL-03)", () => {
  it("test-tz-sa job runs pnpm test:tz:sa (Africa/Johannesburg)", () => {
    const saBlock = extractJobBlock("test-tz-sa", raw);
    expect(
      saBlock,
      "test-tz-sa must invoke pnpm test:tz:sa"
    ).toContain("pnpm test:tz:sa");
  });

  it("test-tz-de job runs pnpm test:tz:de (Europe/Berlin)", () => {
    const deBlock = extractJobBlock("test-tz-de", raw);
    expect(
      deBlock,
      "test-tz-de must invoke pnpm test:tz:de"
    ).toContain("pnpm test:tz:de");
  });

  it("dual-TZ jobs are defined as separate jobs (not a matrix or single job)", () => {
    // Each timezone job reports independently in the GitHub status check UI.
    expect(raw).toMatch(/^  test-tz-sa:/m);
    expect(raw).toMatch(/^  test-tz-de:/m);
    // They must not share a job definition via matrix
    const saBlock = extractJobBlock("test-tz-sa", raw);
    const deBlock = extractJobBlock("test-tz-de", raw);
    expect(saBlock).not.toContain("matrix:");
    expect(deBlock).not.toContain("matrix:");
  });

  it("ci-pass gate accounts for dual-TZ job results", () => {
    // ci-pass must reference both TZ jobs so a TZ failure cannot sneak through.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass must reference test-tz-sa result"
    ).toContain("needs.test-tz-sa.result");
    expect(
      ciPassBlock,
      "ci-pass must reference test-tz-de result"
    ).toContain("needs.test-tz-de.result");
  });
});

describe("data-integrity job runs integrity tests unconditionally on every PR (DATA-05)", () => {
  it("data-integrity job is defined in the workflow", () => {
    // If this job is removed, no integrity test runs on PRs — removing it must
    // be caught immediately rather than silently skipping the DATA-05 gate.
    expect(raw, "data-integrity job must be defined").toMatch(
      /^  data-integrity:/m
    );
  });

  it("data-integrity job runs the full integrity test suite", () => {
    // The integrity suite lives in src/__tests__/integrity/. Running the
    // directory ensures schema-consistency, table-sync, and backup-round-trip
    // tests all execute as part of the gate.
    const block = extractJobBlock("data-integrity", raw);
    expect(
      block,
      "data-integrity job must invoke pnpm exec vitest run src/__tests__/integrity/"
    ).toContain("pnpm exec vitest run src/__tests__/integrity/");
  });

  it("data-integrity job uses Node 20 and frozen-lockfile install (consistent with other jobs)", () => {
    // Consistency across jobs prevents Node version drift and lockfile mutations.
    const block = extractJobBlock("data-integrity", raw);
    expect(block, "data-integrity must use node-version: '20'").toContain(
      "node-version: '20'"
    );
    expect(block, "data-integrity must use --frozen-lockfile").toContain(
      "--frozen-lockfile"
    );
  });

  it("data-integrity job sets up pnpm via pnpm/action-setup", () => {
    const block = extractJobBlock("data-integrity", raw);
    expect(
      block,
      "data-integrity must use pnpm/action-setup"
    ).toContain("pnpm/action-setup");
  });

  it("data-integrity job has no path filter so it runs unconditionally", () => {
    // A path filter would let db.ts changes slip through without integrity
    // verification if the filter is misconfigured. DATA-05 requires the job
    // to run on every PR regardless of which files changed.
    const block = extractJobBlock("data-integrity", raw);
    expect(
      block,
      "data-integrity must not have a paths: filter (must run unconditionally)"
    ).not.toContain("paths:");
    expect(
      block,
      "data-integrity must not be gated on a changes output"
    ).not.toContain("needs.changes.outputs");
  });

  it("ci-pass gate lists data-integrity in its needs array", () => {
    // Without data-integrity in needs, the gate can complete before the
    // integrity job finishes, letting a failing integrity check pass the gate.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass needs array must include data-integrity"
    ).toContain("data-integrity");
  });

  it("ci-pass gate explicitly checks data-integrity result for success", () => {
    // Presence in needs alone is not sufficient — the gate's shell script must
    // explicitly fail when data-integrity does not succeed.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass must explicitly check needs.data-integrity.result"
    ).toContain("needs.data-integrity.result");
  });
});

describe("E2E job runs Playwright tests with Chromium in CI and blocks merge (E2E-01)", () => {
  it("e2e job is defined in the workflow", () => {
    // If the e2e job is missing, E2E tests never run in CI and regressions
    // in UI flows can be merged silently.
    expect(raw, "e2e job must be defined").toMatch(/^  e2e:/m);
  });

  it("e2e job installs Playwright Chromium for headless browser execution", () => {
    // E2E-01 requires Chromium specifically (not Firefox/Safari) for CI runs.
    // The install step must be present so the runner has the browser binary.
    const e2eBlock = extractJobBlock("e2e", raw);
    expect(
      e2eBlock,
      "e2e job must install Chromium via npx playwright install chromium"
    ).toContain("playwright install chromium");
  });

  it("e2e job runs pnpm test:e2e to execute the full Playwright suite", () => {
    // The test:e2e script wires the Playwright runner with the correct config.
    // Running a subset or a different command could silently skip test files.
    const e2eBlock = extractJobBlock("e2e", raw);
    expect(
      e2eBlock,
      "e2e job must invoke pnpm test:e2e"
    ).toContain("pnpm test:e2e");
  });

  it("e2e job uses actions/cache to cache Playwright browser binaries", () => {
    // Chromium binaries are ~300MB. Caching them avoids re-downloading on
    // every CI run, keeping E2E job startup time under 30 seconds.
    const e2eBlock = extractJobBlock("e2e", raw);
    expect(
      e2eBlock,
      "e2e job must cache Playwright browsers with actions/cache"
    ).toContain("actions/cache");
  });

  it("e2e job uploads trace artifacts on failure for debugging flaky tests", () => {
    // Playwright traces (.zip files) contain a recording of the failing test
    // including DOM snapshots and network log. Without upload, failures in CI
    // produce no evidence for post-mortem investigation.
    const e2eBlock = extractJobBlock("e2e", raw);
    expect(
      e2eBlock,
      "e2e job must upload artifacts using actions/upload-artifact"
    ).toContain("actions/upload-artifact");
    expect(
      e2eBlock,
      "trace upload step must only run on failure (if: failure())"
    ).toContain("if: failure()");
  });

  it("e2e job stores traces in test-results/ for the artifact upload path", () => {
    // Playwright writes trace files to test-results/ by default. The upload
    // step must reference this path so traces are actually captured.
    const e2eBlock = extractJobBlock("e2e", raw);
    expect(
      e2eBlock,
      "artifact upload path must be test-results/"
    ).toContain("test-results/");
  });

  it("ci-pass gate includes e2e in its needs array", () => {
    // Without e2e in needs, ci-pass can complete before E2E tests finish,
    // letting a failing E2E run be ignored and a PR merged anyway.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass needs array must include e2e"
    ).toContain("e2e");
  });

  it("ci-pass gate references e2e result so E2E failure blocks merge", () => {
    // The gate's shell script must explicitly check needs.e2e.result.
    // Presence in needs alone does not cause the gate to fail if E2E fails.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass must reference needs.e2e.result"
    ).toContain("needs.e2e.result");
  });
});

describe("Supply-chain job verifies config drift and audits dependencies (SCHN-04)", () => {
  it("supply-chain job is defined in the workflow", () => {
    // If the supply-chain job is removed, no config drift or vulnerability
    // check runs on PRs and SCHN-01..03 settings could be silently deleted.
    expect(raw, "supply-chain job must be defined").toMatch(
      /^  supply-chain:/m
    );
  });

  it("supply-chain config drift step checks minimumReleaseAge is present in pnpm-workspace.yaml", () => {
    // If minimumReleaseAge is removed from pnpm-workspace.yaml the 24-hour
    // quarantine window (SCHN-01) is silently lost. The CI grep catch catches
    // accidental deletion before it reaches main.
    const block = extractJobBlock("supply-chain", raw);
    expect(
      block,
      "supply-chain job must grep for minimumReleaseAge in pnpm-workspace.yaml"
    ).toContain("minimumReleaseAge");
  });

  it("supply-chain config drift step checks trustPolicy is present in pnpm-workspace.yaml", () => {
    // If trustPolicy is removed from pnpm-workspace.yaml the publisher
    // downgrade detection (SCHN-02) is silently lost.
    const block = extractJobBlock("supply-chain", raw);
    expect(
      block,
      "supply-chain job must grep for trustPolicy in pnpm-workspace.yaml"
    ).toContain("trustPolicy");
  });

  it("supply-chain config drift step checks blockExoticSubdeps is present in pnpm-workspace.yaml", () => {
    // If blockExoticSubdeps is removed from pnpm-workspace.yaml the
    // git/tarball blocking (SCHN-03) is silently lost.
    const block = extractJobBlock("supply-chain", raw);
    expect(
      block,
      "supply-chain job must grep for blockExoticSubdeps in pnpm-workspace.yaml"
    ).toContain("blockExoticSubdeps");
  });

  it("supply-chain job runs pnpm audit to scan for known vulnerabilities", () => {
    // The audit step catches new CVEs introduced via dependency updates
    // and ensures the project stays below the high-severity threshold.
    const block = extractJobBlock("supply-chain", raw);
    expect(
      block,
      "supply-chain job must run pnpm audit"
    ).toContain("pnpm audit");
  });

  it("supply-chain config drift step checks auditLevel is present in pnpm-workspace.yaml (SCHN-04)", () => {
    // Phase 25 added auditLevel as the 4th security setting verified by the
    // drift check for-loop. If auditLevel is removed from pnpm-workspace.yaml
    // the audit enforcement level is silently lost. The CI grep loop must
    // include auditLevel alongside the other 3 settings so accidental deletion
    // is caught before reaching main.
    const block = extractJobBlock("supply-chain", raw);
    expect(
      block,
      "supply-chain config drift step must grep for auditLevel in pnpm-workspace.yaml"
    ).toContain("auditLevel");
  });

  it("supply-chain audit step uses --audit-level high so only critical/high CVEs fail the gate", () => {
    // --audit-level high means moderate and low findings are reported but
    // do not block the PR, matching the project's risk tolerance (D-01).
    const block = extractJobBlock("supply-chain", raw);
    expect(
      block,
      "supply-chain audit step must pass --audit-level high"
    ).toContain("--audit-level high");
  });

  it("ci-pass gate includes supply-chain in its needs array", () => {
    // Without supply-chain in needs, ci-pass can complete before the audit
    // finishes, letting a failing audit be ignored while a PR is merged.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass needs array must include supply-chain"
    ).toContain("supply-chain");
  });

  it("ci-pass gate explicitly checks supply-chain result for success", () => {
    // Presence in needs alone is not sufficient — the gate's shell script
    // must explicitly fail when the supply-chain job does not succeed.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass must explicitly check needs.supply-chain.result"
    ).toContain("needs.supply-chain.result");
  });
});

// ---------------------------------------------------------------------------
// Phase 24 additions: path filtering, coverage, build caching, benchmarks
// ---------------------------------------------------------------------------

describe("Path filtering gates expensive jobs on src/bench changes (CIOP-01)", () => {
  it("changes job is defined and uses dorny/paths-filter@v4", () => {
    // Without the changes job, all downstream gating logic collapses and every
    // job runs unconditionally, defeating the purpose of path-based filtering.
    expect(raw, "changes job must be defined").toMatch(/^  changes:/m);
    const changesBlock = extractJobBlock("changes", raw);
    expect(
      changesBlock,
      "changes job must use dorny/paths-filter@v4"
    ).toContain("dorny/paths-filter@v4");
  });

  it("changes job defines 'src' and 'bench' filter categories as outputs", () => {
    // Both categories are consumed downstream: src gates test/e2e/coverage jobs,
    // bench gates the benchmark job. Missing either silently disables that gate.
    const changesBlock = extractJobBlock("changes", raw);
    expect(changesBlock, "changes job must define 'src' output").toContain(
      "src:"
    );
    expect(changesBlock, "changes job must define 'bench' output").toContain(
      "bench:"
    );
  });

  it("test-tz-sa and test-tz-de jobs depend on changes and gate on src output", () => {
    // Docs-only PRs must skip expensive test jobs. These jobs need changes in
    // their needs array and a conditional checking the src output.
    for (const job of ["test-tz-sa", "test-tz-de"]) {
      const block = extractJobBlock(job, raw);
      expect(block, `${job} must need the changes job`).toContain("changes");
      expect(
        block,
        `${job} must gate on needs.changes.outputs.src == 'true'`
      ).toContain("needs.changes.outputs.src");
    }
  });

  it("e2e job depends on changes and gates on src output", () => {
    // E2E tests are the most expensive job; gating on src changes prevents
    // them from running on docs-only or config-only PRs.
    const e2eBlock = extractJobBlock("e2e", raw);
    expect(e2eBlock, "e2e job must need the changes job").toContain("changes");
    expect(
      e2eBlock,
      "e2e must gate on needs.changes.outputs.src == 'true'"
    ).toContain("needs.changes.outputs.src");
  });

  it("benchmark job depends on changes and gates on bench output", () => {
    // The benchmark job only needs to run when db.ts, migration tests, integrity
    // tests, or backup-service change. Gating on bench output keeps CI fast.
    const benchBlock = extractJobBlock("benchmark", raw);
    expect(benchBlock, "benchmark job must need the changes job").toContain(
      "changes"
    );
    expect(
      benchBlock,
      "benchmark must gate on needs.changes.outputs.bench == 'true'"
    ).toContain("needs.changes.outputs.bench");
  });
});

describe("Coverage job produces delta PR comments for src changes (CIOP-02)", () => {
  it("coverage job is defined in the workflow", () => {
    // If the coverage job is removed, no coverage delta comments appear on PRs
    // and regressions in test coverage go undetected before merge.
    expect(raw, "coverage job must be defined").toMatch(/^  coverage:/m);
  });

  it("coverage job runs pnpm test:coverage to generate coverage data", () => {
    // pnpm test:coverage invokes vitest with --coverage, which produces the
    // coverage-summary.json files consumed by davelosert/vitest-coverage-report-action.
    const block = extractJobBlock("coverage", raw);
    expect(
      block,
      "coverage job must invoke pnpm test:coverage"
    ).toContain("pnpm test:coverage");
  });

  it("coverage job uses davelosert/vitest-coverage-report-action@v2 to post PR comments", () => {
    // This action reads the two coverage-summary.json files (base and PR branch)
    // and posts a delta table as a PR comment. Without it, coverage data is
    // generated but never surfaced to reviewers.
    const block = extractJobBlock("coverage", raw);
    expect(
      block,
      "coverage job must use davelosert/vitest-coverage-report-action@v2"
    ).toContain("davelosert/vitest-coverage-report-action@v2");
  });

  it("coverage job is gated on src changes via the changes job", () => {
    // Coverage is expensive to run twice (base + PR branch). Gating on src
    // changes means docs-only PRs skip it entirely.
    const block = extractJobBlock("coverage", raw);
    expect(block, "coverage job must need the changes job").toContain("changes");
    expect(
      block,
      "coverage must gate on needs.changes.outputs.src"
    ).toContain("needs.changes.outputs.src");
  });

  it("ci-pass gate lists coverage in its needs array", () => {
    // Without coverage in needs, ci-pass can complete while the coverage job
    // is still running, allowing a PR to be merged before coverage is reported.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass needs array must include coverage"
    ).toContain("coverage");
  });
});

describe("Build job caches .next/cache to speed up repeat builds (CIOP-03)", () => {
  it("build job uses actions/cache@v4 to cache .next/cache", () => {
    // Without caching the Next.js build cache, every CI run rebuilds from
    // scratch, adding ~30-60 seconds to the build job on unchanged code.
    const buildBlock = extractJobBlock("build", raw);
    expect(
      buildBlock,
      "build job must use actions/cache@v4"
    ).toContain("actions/cache@v4");
    expect(
      buildBlock,
      "build job cache path must include .next/cache"
    ).toContain(".next/cache");
  });

  it("build job cache key uses hashFiles over pnpm-lock.yaml and next.config", () => {
    // A content-addressed key ensures the cache is invalidated when dependencies
    // or Next.js config change, preventing stale cache hits from masking issues.
    const buildBlock = extractJobBlock("build", raw);
    expect(
      buildBlock,
      "build cache key must use hashFiles for pnpm-lock.yaml"
    ).toContain("pnpm-lock.yaml");
    expect(
      buildBlock,
      "build cache key must use hashFiles for next.config"
    ).toContain("next.config");
  });
});

describe("Benchmark job runs in CI gated on bench-relevant file changes (BNCH-01)", () => {
  it("benchmark job is defined in the workflow", () => {
    // If the benchmark job is removed, pnpm bench --compare never runs in CI
    // and performance regressions in migration chains or backup round-trips
    // go undetected before merge.
    expect(raw, "benchmark job must be defined").toMatch(/^  benchmark:/m);
  });

  it("benchmark job runs pnpm bench with --run and --compare flags", () => {
    // --run prevents vitest from entering watch mode in CI.
    // --compare benchmarks/results.json reads the committed baseline and exits
    // non-zero if any benchmark regresses beyond the threshold.
    const block = extractJobBlock("benchmark", raw);
    expect(
      block,
      "benchmark job must invoke pnpm bench"
    ).toContain("pnpm bench");
    expect(
      block,
      "benchmark job must pass --run flag"
    ).toContain("--run");
    expect(
      block,
      "benchmark job must pass --compare with baseline path"
    ).toContain("--compare");
    expect(
      block,
      "benchmark --compare must reference benchmarks/results.json"
    ).toContain("benchmarks/results.json");
  });

  it("ci-pass gate lists benchmark in its needs array", () => {
    // Without benchmark in needs, ci-pass can succeed before the benchmark
    // job completes, allowing a perf regression to slip through the gate.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    expect(
      ciPassBlock,
      "ci-pass needs array must include benchmark"
    ).toContain("benchmark");
  });
});

describe("ci-pass gate accepts success or skipped for gated jobs (CIOP-01, BNCH-01)", () => {
  it("ci-pass separates unconditional jobs (must succeed) from gated jobs (success or skipped)", () => {
    // Unconditional jobs failing should always block the gate.
    // Gated jobs legitimately skip on docs-only PRs; treating skip as failure
    // would make docs PRs permanently un-mergeable.
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    // Unconditional: must check != success (failure semantics)
    expect(
      ciPassBlock,
      "ci-pass must check unconditional jobs for != success"
    ).toContain("!= \"success\"");
    // Gated: must accept skipped in addition to success
    expect(
      ciPassBlock,
      "ci-pass must accept 'skipped' for gated jobs"
    ).toContain("skipped");
  });

  it("ci-pass gated check covers test-tz-sa, test-tz-de, e2e, coverage, benchmark", () => {
    // All five gated jobs must appear in the skipped-aware iteration block.
    // If any is missing, a failure in that job cannot block the gate when
    // the job runs (non-skip scenario).
    const ciPassBlock = extractJobBlock("ci-pass", raw);
    const gatedJobs = ["test-tz-sa", "test-tz-de", "e2e", "coverage", "benchmark"];
    for (const job of gatedJobs) {
      expect(
        ciPassBlock,
        `ci-pass must reference needs.${job}.result in gated check`
      ).toContain(`needs.${job}.result`);
    }
  });
});
