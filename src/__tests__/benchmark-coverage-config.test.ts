/**
 * Benchmark infrastructure and coverage reporter config validation.
 *
 * Behavioral framing:
 *   CIOP-02: vitest.config.ts has coverage block with json-summary reporter
 *            so davelosert/vitest-coverage-report-action can consume
 *            coverage/coverage-summary.json in CI.
 *   BNCH-01: bench and bench:ci scripts are defined in package.json,
 *            bench files exist on disk, and the committed baseline JSON
 *            enables pnpm bench --compare to detect regressions in CI.
 *
 * Run with: pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(process.cwd());

describe("vitest.config.ts has coverage reporters required for CI (CIOP-02)", () => {
  it("vitest.config.ts contains a coverage block with the json-summary reporter", () => {
    // davelosert/vitest-coverage-report-action reads coverage/coverage-summary.json.
    // Without json-summary in the reporters list the file is never generated
    // and the coverage action fails silently.
    const configPath = path.join(ROOT, "vitest.config.ts");
    expect(fs.existsSync(configPath), "vitest.config.ts must exist").toBe(true);
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "vitest.config.ts must declare a coverage block"
    ).toContain("coverage:");
    expect(
      contents,
      "coverage reporters must include json-summary"
    ).toContain("json-summary");
  });

  it("coverage block specifies the v8 provider", () => {
    // v8 is the project-standard provider and is required by @vitest/coverage-v8.
    const configPath = path.join(ROOT, "vitest.config.ts");
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "coverage block must set provider: 'v8'"
    ).toContain("v8");
  });

  it("coverage block includes the json reporter alongside json-summary", () => {
    // Both reporters are needed: json-summary for the coverage action comparison,
    // and json for per-file coverage details.
    const configPath = path.join(ROOT, "vitest.config.ts");
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "coverage reporters must include json"
    ).toContain('"json"');
  });
});

describe("package.json has bench scripts required for CI benchmark job (BNCH-01)", () => {
  it("package.json defines a 'bench' script for local benchmark runs", () => {
    // The CI benchmark job invokes pnpm bench --run --compare; without this
    // script the benchmark job fails immediately with a missing-script error.
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
    // The bench script must delegate to vitest bench so vitest's --run and
    // --compare flags are forwarded correctly by the CI benchmark job.
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(
      pkg.scripts["bench"],
      "bench script must invoke vitest bench"
    ).toContain("vitest bench");
  });

  it("package.json defines a 'bench:ci' script for writing updated baselines", () => {
    // bench:ci writes a new baseline JSON to benchmarks/results.json.
    // Even though CI uses --compare (read-only), the script must exist for
    // developers to regenerate the baseline after intentional perf changes.
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
  it("benchmarks/results.json exists as the committed baseline", () => {
    // pnpm bench --run --compare benchmarks/results.json fails if the baseline
    // file does not exist. Without a committed baseline the CI benchmark job
    // cannot detect performance regressions.
    const baselinePath = path.join(ROOT, "benchmarks/results.json");
    expect(
      fs.existsSync(baselinePath),
      "benchmarks/results.json must exist"
    ).toBe(true);
  });

  it("benchmarks/results.json is valid JSON with a files array", () => {
    // A corrupt or empty baseline causes pnpm bench --compare to fail with
    // a parse error, making the CI benchmark job report as broken rather
    // than detecting a real performance regression.
    const baselinePath = path.join(ROOT, "benchmarks/results.json");
    const raw = fs.readFileSync(baselinePath, "utf-8");
    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(raw);
    }, "benchmarks/results.json must be valid JSON").not.toThrow();
    expect(
      (parsed as { files?: unknown }).files,
      "benchmarks/results.json must have a top-level 'files' array"
    ).toBeDefined();
    expect(
      Array.isArray((parsed as { files: unknown }).files),
      "'files' must be an array"
    ).toBe(true);
  });

  it("benchmarks/results.json filepath entries do not contain worktree paths (BNCH-01)", () => {
    // Phase 25 regenerated the baseline from the main repo root to remove
    // .claude/worktrees/ path references. If the file is regenerated from a
    // worktree again, the CI --compare run will reference non-existent paths
    // and the benchmark job will fail for wrong reasons.
    const baselinePath = path.join(ROOT, "benchmarks/results.json");
    const contents = fs.readFileSync(baselinePath, "utf-8");
    expect(
      contents,
      "benchmarks/results.json must not contain worktree paths (.claude/worktrees)"
    ).not.toContain(".claude/worktrees");
    expect(
      contents,
      "benchmarks/results.json must not contain the string 'worktrees'"
    ).not.toContain("worktrees");
  });
});

describe("tsconfig.json has ES2020 target required for typecheck CI job (CIPL-01)", () => {
  it("tsconfig.json sets target to ES2020 so tsc --noEmit passes without TS1501/TS2802 errors", () => {
    // Phase 25 added "target": "ES2020" to fix 4 TypeScript errors:
    // TS1501 (regex s-flag requires ES2018+) and TS2802 (Set spread requires ES2015+).
    // Without this setting the typecheck CI job fails. ES2020 is the minimum
    // target that resolves all 4 errors; this does not affect Next.js SWC transpilation.
    const tsconfigPath = path.join(ROOT, "tsconfig.json");
    expect(fs.existsSync(tsconfigPath), "tsconfig.json must exist").toBe(true);
    const contents = fs.readFileSync(tsconfigPath, "utf-8");
    const parsed = JSON.parse(contents) as {
      compilerOptions?: { target?: string };
    };
    expect(
      parsed.compilerOptions?.target,
      'tsconfig.json compilerOptions.target must be "ES2020"'
    ).toBe("ES2020");
  });
});

describe("vitest.config.ts excludes .claude/** to prevent worktree bench file discovery (CIPL-03)", () => {
  it("vitest test.exclude includes .claude/** so worktree test files are never discovered", () => {
    // Phase 25 found that pnpm bench:ci from the main repo root picked up
    // .bench.ts files from .claude/worktrees/ directories, producing worktree
    // paths in results.json. Adding .claude/** to exclude prevents this.
    const configPath = path.join(ROOT, "vitest.config.ts");
    expect(fs.existsSync(configPath), "vitest.config.ts must exist").toBe(true);
    const contents = fs.readFileSync(configPath, "utf-8");
    expect(
      contents,
      "vitest.config.ts test.exclude must include '.claude/**'"
    ).toContain(".claude/**");
  });

  it("vitest benchmark.exclude includes .claude/** so worktree bench files are never discovered", () => {
    // The benchmark.exclude must separately list .claude/** because vitest bench
    // uses a different discovery pass from the regular test runner.
    const configPath = path.join(ROOT, "vitest.config.ts");
    const contents = fs.readFileSync(configPath, "utf-8");
    // Verify the exclude appears inside the benchmark block by checking that
    // "benchmark" and ".claude/**" both appear in the config.
    expect(
      contents,
      "vitest.config.ts must have a benchmark block"
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
