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
});
