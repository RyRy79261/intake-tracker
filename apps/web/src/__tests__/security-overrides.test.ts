/**
 * Dependabot security-override governance.
 *
 * 1. Every ranged override replacement in pnpm-workspace.yaml must be
 *    upper-bounded. An unbounded value (e.g. '>=3.1.2') lets pnpm jump a
 *    transitive dependency across a major (fast-uri went 3.x -> 4.x, a 7.x
 *    undici consumer went 8.x) the next time the override re-resolves.
 * 2. The lockfile must not resolve any package into a vulnerable range that
 *    has a within-major fix. Each row maps to a GitHub Dependabot alert on
 *    the default branch (alerts read pnpm-lock.yaml, not pnpm audit config).
 *
 * Run with: pnpm exec vitest run src/__tests__/security-overrides.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(process.cwd(), "../..");

let workspaceRaw: string;
let lockRaw: string;

beforeAll(() => {
  workspaceRaw = fs.readFileSync(path.join(ROOT, "pnpm-workspace.yaml"), "utf-8");
  lockRaw = fs.readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf-8");
});

type Version = [number, number, number];

function parseVersion(v: string): Version {
  const [core] = v.split(/[-+]/);
  const parts = (core ?? "").split(".").map((n) => Number.parseInt(n, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compare(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i]! !== vb[i]!) return va[i]! - vb[i]!;
  }
  return 0;
}

/** Every version of `name` present in the lockfile's packages section. */
function lockedVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`^ {2}'?${escaped}@(\\d+\\.\\d+\\.\\d+[^'(:]*)'?[(:]`, "gm");
  const found = new Set<string>();
  for (const m of lockRaw.matchAll(re)) found.add(m[1]!);
  return [...found];
}

function overrideEntries(): Array<{ key: string; value: string }> {
  const lines = workspaceRaw.split("\n");
  const start = lines.findIndex((l) => l.trim() === "overrides:");
  expect(start, "pnpm-workspace.yaml must have an overrides: block").toBeGreaterThan(-1);
  const entries: Array<{ key: string; value: string }> = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!line.startsWith("  ")) break;
    const m = line.match(/^\s+(.+?):\s+'([^']*)'\s*$/);
    if (m) entries.push({ key: m[1]!, value: m[2]! });
  }
  return entries;
}

describe("pnpm overrides stay within the resolved major", () => {
  it("every '>=' override replacement also carries a '<' upper bound", () => {
    const entries = overrideEntries();
    expect(entries.length).toBeGreaterThan(0);
    const unbounded = entries
      .filter((e) => e.value.includes(">=") && !/<\s*\d/.test(e.value))
      .map((e) => `${e.key}: '${e.value}'`);
    expect(unbounded, "override values must be upper-bounded within their major").toEqual([]);
  });

  it("each ranged replacement stops at the next major (next minor for 0.x)", () => {
    // `>=3.1.6 <5.0.0` has an upper bound but still allows a jump into 4.x.
    const crossing = overrideEntries()
      .map((e) => {
        const lo = e.value.match(/>=\s*(\d+)\.(\d+)\.\d+/);
        const hi = e.value.match(/<\s*(\d+)\.(\d+)\.(\d+)/);
        if (!lo || !hi) return null;
        const [loMajor, loMinor] = [Number(lo[1]), Number(lo[2])];
        const expected = loMajor === 0 ? `0.${loMinor + 1}.0` : `${loMajor + 1}.0.0`;
        const actual = `${hi[1]}.${hi[2]}.${hi[3]}`;
        return actual === expected ? null : `${e.key}: '${e.value}' (upper bound should be <${expected})`;
      })
      .filter((x): x is string => x !== null);
    expect(crossing).toEqual([]);
  });
});

/**
 * [package, lowest affected, first patched (exclusive upper bound), advisory].
 * A locked version v fails when lowest <= v < patched.
 */
const FIXED_ADVISORIES: Array<[string, string, string, string]> = [
  ["brace-expansion", "0.0.0", "1.1.18", "GHSA-3jxr/mh99/rgw5 (1.x)"],
  // Bounding the testcontainers/archiver chain back into its declared majors
  // re-introduced brace-expansion 2.x, minimatch 5.x/9.x and glob 10.x; the
  // same advisories cover those lines, so guard them too.
  ["brace-expansion", "2.0.0", "2.1.4", "GHSA-3jxr/mh99/rgw5 (2.x)"],
  // One row on purpose: GHSA-3jxr-9vmj-r5cp covers every 3.x (>=3.0.0 <5.0.7),
  // so no 3.x release is safe even though GHSA-rgw5 alone patches 3.0.6.
  ["brace-expansion", "3.0.0", "5.0.9", "GHSA-3jxr/mh99/rgw5 (3.x-5.x)"],
  ["minimatch", "0.0.0", "3.1.4", "GHSA-3ppc/7r86/23c5 (3.x)"],
  ["minimatch", "5.0.0", "5.1.8", "GHSA-3ppc/7r86/23c5 (5.x)"],
  ["minimatch", "9.0.0", "9.0.7", "GHSA-3ppc/7r86/23c5 (9.x)"],
  ["minimatch", "10.0.0", "10.2.3", "GHSA-3ppc/7r86/23c5 (10.x)"],
  ["glob", "10.2.0", "10.5.0", "GHSA-5j98-mcp5-4vw2"],
  ["browserslist", "0.0.0", "4.28.7", "GHSA-73wf-gq98-2v4g / GHSA-c83g-rgw3-j3cx"],
  ["fast-uri", "3.0.0", "3.1.6", "GHSA-5jgf/7p8r/f65p/fph4/jqff/v2hh"],
  ["@simplewebauthn/server", "0.0.0", "13.3.2", "GHSA-6hxq-p678-4hr2"],
  ["dompurify", "0.0.0", "3.4.13", "GHSA-c2j3-45gr-mqc4 / GHSA-55q2-fjhq-7xh7"],
  ["fflate", "0.8.0", "0.8.3", "GHSA-px8p-9vwx-vf98"],
  ["qs", "2.2.5", "6.16.0", "GHSA-4mjr-xmp4-gh2g / GHSA-x5fp-wj9c-mxmx"],
];

describe("lockfile resolves no package into a fixed Dependabot range", () => {
  it.each(FIXED_ADVISORIES)(
    "%s has no locked version in [%s, %s) (%s)",
    (name, lowest, patched) => {
      const versions = lockedVersions(name);
      expect(versions.length, `${name} should appear in pnpm-lock.yaml`).toBeGreaterThan(0);
      const vulnerable = versions.filter(
        (v) => compare(v, lowest) >= 0 && compare(v, patched) < 0
      );
      expect(vulnerable).toEqual([]);
    }
  );
});
