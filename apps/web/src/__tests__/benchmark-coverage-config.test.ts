/**
 * Benchmark infrastructure and coverage reporter config validation.
 *
 * Behavioral framing:
 *   CIOP-02: vitest.config.mts has coverage block with json-summary reporter
 *            so davelosert/vitest-coverage-report-action can consume
 *            coverage/coverage-summary.json in CI.
 *   BNCH-01: bench and bench:ci scripts are defined in package.json,
 *            bench files exist on disk, and each bench has a committed
 *            baseline JSON that CI prints next to the fresh result.
 *
 * Run with: pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(process.cwd());

describe("vitest.config.mts has coverage reporters required for CI (CIOP-02)", () => {
  it("vitest.config.mts contains a coverage block with the json-summary reporter", () => {
    // davelosert/vitest-coverage-report-action reads coverage/coverage-summary.json.
    // Without json-summary in the reporters list the file is never generated
    // and the coverage action fails silently.
    const configPath = path.join(ROOT, "vitest.config.mts");
    expect(fs.existsSync(configPath), "vitest.config.mts must exist").toBe(true);
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "vitest.config.mts must declare a coverage block"
    ).toContain("coverage:");
    expect(
      contents,
      "coverage reporters must include json-summary"
    ).toContain("json-summary");
  });

  it("coverage block specifies the v8 provider", () => {
    // v8 is the project-standard provider and is required by @vitest/coverage-v8.
    const configPath = path.join(ROOT, "vitest.config.mts");
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "coverage block must set provider: 'v8'"
    ).toContain("v8");
  });

  it("coverage block includes the json reporter alongside json-summary", () => {
    // Both reporters are needed: json-summary for the coverage action comparison,
    // and json for per-file coverage details.
    const configPath = path.join(ROOT, "vitest.config.mts");
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "coverage reporters must include json"
    ).toContain('"json"');
  });
});

describe("package.json has bench scripts required for CI benchmark job (BNCH-01)", () => {
  it("package.json defines a 'bench' script for local benchmark runs", () => {
    // Developers run benchmarks locally through this script.
    const pkgPath = path.join(ROOT, "package.json");
    expect(fs.existsSync(pkgPath), "package.json must exist").toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(
      pkg.scripts,
      "package.json must have a scripts block"
    ).toBeDefined();
    expect(
      pkg.scripts["bench"],
      "'bench' script must be defined in package.json"
    ).toBeDefined();
  });

  it("bench script invokes vitest bench", () => {
    // The bench script must delegate to vitest bench so CLI flags such as
    // --run are forwarded correctly.
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(
      pkg.scripts["bench"],
      "bench script must invoke vitest bench"
    ).toContain("vitest bench");
  });

  it("package.json defines a 'bench:ci' script for writing updated baselines", () => {
    // bench:ci rewrites the baselines in benchmarks/ (BENCH_WRITE_BASELINE=1).
    // CI only reads them, so the script must exist for developers to
    // regenerate the baselines after intentional perf changes.
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(
      pkg.scripts["bench:ci"],
      "'bench:ci' script must be defined in package.json"
    ).toBeDefined();
  });
});

describe("benchmark files exist on disk for CI to execute (BNCH-01)", () => {
  it("migration.bench.ts exists in src/__tests__/bench/", () => {
    // The CI benchmark job runs pnpm bench --run which discovers files via
    // vitest's benchmark.include pattern. If this file is missing the
    // migration chain benchmark never runs and regressions go undetected.
    const benchPath = path.join(
      ROOT,
      "src/__tests__/bench/migration.bench.ts"
    );
    expect(
      fs.existsSync(benchPath),
      "src/__tests__/bench/migration.bench.ts must exist"
    ).toBe(true);
  });

  it("backup.bench.ts exists in src/__tests__/bench/", () => {
    // The backup round-trip benchmark measures export+import performance
    // across all 16 Dexie tables. If the file is missing the CI benchmark
    // job silently skips backup regression detection.
    const benchPath = path.join(ROOT, "src/__tests__/bench/backup.bench.ts");
    expect(
      fs.existsSync(benchPath),
      "src/__tests__/bench/backup.bench.ts must exist"
    ).toBe(true);
  });
});

describe("benchmark baseline JSON exists for CI regression comparison (BNCH-01)", () => {
  // Each bench compares itself against benchmarks/<slug>.json through
  // bench.from() (src/__tests__/bench/baseline.ts). A missing baseline makes
  // the bench run without a comparison, so the regression signal is lost.
  for (const slug of ["migration", "backup"]) {
    it(`benchmarks/${slug}.json exists as the committed baseline`, () => {
      const baselinePath = path.join(ROOT, `benchmarks/${slug}.json`);
      expect(
        fs.existsSync(baselinePath),
        `benchmarks/${slug}.json must exist`
      ).toBe(true);
    });

    it(`benchmarks/${slug}.json is valid baseline data with latency statistics`, () => {
      // bench.from() reads this file as Vitest BaselineData; a corrupt file
      // breaks the CI benchmark job instead of reporting a regression.
      const baselinePath = path.join(ROOT, `benchmarks/${slug}.json`);
      const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf-8")) as {
        latency?: { mean?: unknown };
      };
      expect(
        typeof parsed.latency?.mean,
        `benchmarks/${slug}.json must have latency.mean`
      ).toBe("number");
    });
  }
});

describe("shared tsconfig sets a high enough target for the typecheck CI job (CIPL-01)", () => {
  it("@intake/typescript-config base sets target ES2022 so tsc passes without TS1501/TS2802", () => {
    // The compiler target moved into the shared @intake/typescript-config
    // (Turborepo Phase 1); apps/web inherits it via `extends`. ES2022 is >= the
    // former ES2020 floor and still resolves TS1501 (regex s-flag, ES2018+) and
    // TS2802 (Set/Map spread, ES2015+). Does not affect Next.js SWC transpilation.
    const basePath = path.resolve(
      ROOT,
      "../../packages/typescript-config/base.json"
    );
    expect(fs.existsSync(basePath), "shared base tsconfig must exist").toBe(true);
    const parsed = JSON.parse(fs.readFileSync(basePath, "utf-8")) as {
      compilerOptions?: { target?: string };
    };
    expect(
      parsed.compilerOptions?.target,
      'shared base tsconfig compilerOptions.target must be "ES2022"'
    ).toBe("ES2022");
  });
});

describe("vitest.config.mts excludes .claude/** to prevent worktree bench file discovery (CIPL-03)", () => {
  it("vitest test.exclude includes .claude/** so worktree test files are never discovered", () => {
    // Phase 25 found that pnpm bench:ci from the main repo root picked up
    // .bench.ts files from .claude/worktrees/ directories, producing worktree
    // paths in results.json. Adding .claude/** to exclude prevents this.
    const configPath = path.join(ROOT, "vitest.config.mts");
    expect(fs.existsSync(configPath), "vitest.config.mts must exist").toBe(true);
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "vitest.config.mts test.exclude must include '.claude/**'"
    ).toContain(".claude/**");
  });

  it("vitest benchmark.exclude includes .claude/** so worktree bench files are never discovered", () => {
    // The benchmark.exclude must separately list .claude/** because vitest bench
    // uses a different discovery pass from the regular test runner.
    const configPath = path.join(ROOT, "vitest.config.mts");
    const contents = fs.readFileSync(configPath, "utf-8");
    // Verify the exclude appears inside the benchmark block by checking that
    // "benchmark" and ".claude/**" both appear in the config.
    expect(
      contents,
      "vitest.config.mts must have a benchmark block"
    ).toContain("benchmark:");
    // Count occurrences — must appear at least twice (once in test.exclude, once
    // in benchmark.exclude) to satisfy both exclusion paths.
    const occurrences = (contents.match(/\.claude\/\*\*/g) ?? []).length;
    expect(
      occurrences,
      "'.claude/**' must appear in both test.exclude and benchmark.exclude (at least 2 occurrences)"
    ).toBeGreaterThanOrEqual(2);
  });
});
