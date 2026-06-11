#!/usr/bin/env tsx
/**
 * Mutation-score ratchet check.
 *
 * Reads .stryker-tmp/mutation/report.json (emitted by Stryker's `json`
 * reporter) and compares each per-file score against the corresponding
 * floor in .stryker-baseline.json. Exits 1 if any score dropped.
 *
 * Wired into the nightly mutation workflow so a score regression is
 * caught even though the workflow doesn't run per-PR.
 *
 * To intentionally lower a baseline (e.g. you removed dead code that
 * was well-tested), edit .stryker-baseline.json in the same commit
 * that drops the score.
 */
import * as fs from "fs";
import * as path from "path";

interface StrykerReport {
  files: Record<
    string,
    {
      mutants: Array<{ status: string }>;
    }
  >;
}

interface Baseline {
  files: Record<string, number>;
  overall: number;
}

const REPORT_PATH = path.resolve(".stryker-tmp/mutation/report.json");
const BASELINE_PATH = path.resolve(".stryker-baseline.json");

// Stryker considers these statuses "killed" for score purposes —
// timeouts and runtime errors count as kills because they prove the
// mutant didn't silently succeed.
const KILLED_STATUSES = new Set([
  "Killed",
  "Timeout",
  "RuntimeError",
  "CompileError",
]);

function score(
  mutants: Array<{ status: string }>,
): { killed: number; covered: number; total: number; pct: number } {
  let killed = 0;
  let covered = 0;
  let total = 0;
  for (const m of mutants) {
    total++;
    if (m.status === "NoCoverage") continue;
    covered++;
    if (KILLED_STATUSES.has(m.status)) killed++;
  }
  // Match Stryker's score formula: killed / total over all mutants
  // (including NoCoverage). This matches the "% Mutation score
  // total" column in the CLI table.
  const pct = total === 0 ? 100 : (killed / total) * 100;
  return { killed, covered, total, pct };
}

function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`[mutation-baseline] ${BASELINE_PATH} not found`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as
    | Baseline
    | { _comment?: string; files: Record<string, number>; overall: number };
  return { files: raw.files, overall: raw.overall };
}

function loadReport(): StrykerReport {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error(`[mutation-baseline] ${REPORT_PATH} not found — did Stryker run?`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) as StrykerReport;
}

function main(): void {
  const baseline = loadBaseline();
  const report = loadReport();

  let dropCount = 0;
  const rows: string[] = [];

  // Per-file check
  for (const [file, floor] of Object.entries(baseline.files)) {
    const fileReport = report.files[file];
    if (!fileReport) {
      console.warn(
        `[mutation-baseline] ${file} is in baseline but missing from report — skipping`,
      );
      continue;
    }
    const { pct } = score(fileReport.mutants);
    const status = pct >= floor ? "OK" : "DROP";
    const arrow = pct >= floor ? "→" : "↓";
    rows.push(
      `  [${status}] ${file.padEnd(28)} ${floor.toFixed(2)}% ${arrow} ${pct.toFixed(2)}%`,
    );
    if (pct < floor) dropCount++;
  }

  // Overall check
  const allMutants = Object.values(report.files).flatMap((f) => f.mutants);
  const overallPct = score(allMutants).pct;
  const overallStatus = overallPct >= baseline.overall ? "OK" : "DROP";
  const overallArrow = overallPct >= baseline.overall ? "→" : "↓";
  rows.push(
    `  [${overallStatus}] ${"OVERALL".padEnd(28)} ${baseline.overall.toFixed(2)}% ${overallArrow} ${overallPct.toFixed(2)}%`,
  );
  if (overallPct < baseline.overall) dropCount++;

  console.log("");
  console.log("Mutation-score ratchet:");
  for (const row of rows) console.log(row);
  console.log("");

  if (dropCount > 0) {
    console.error(
      `[mutation-baseline] FAIL — ${dropCount} score(s) dropped below baseline. ` +
        `Either restore tests, or intentionally lower the floor in .stryker-baseline.json.`,
    );
    process.exit(1);
  }
  console.log("[mutation-baseline] OK — every score holds the floor.");
}

main();
