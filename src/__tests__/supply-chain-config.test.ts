/**
 * Supply chain security configuration validation (SCHN-01, SCHN-02, SCHN-03).
 *
 * Behavioral framing:
 *   SCHN-01: pnpm quarantines packages published less than 24 hours ago
 *            by enforcing minimumReleaseAge: 1440 in pnpm-workspace.yaml.
 *   SCHN-02: pnpm detects publisher account downgrade/compromise by enforcing
 *            trustPolicy: no-downgrade in pnpm-workspace.yaml.
 *   SCHN-03: pnpm blocks packages resolved from git refs or arbitrary tarballs
 *            (exotic sub-dependencies) via blockExoticSubdeps: true.
 *   Additional: auditLevel: high ensures only critical/high CVEs block installs;
 *               auditConfig.ignoreCves documents false-positive exclusions with
 *               rationale comments so reviewers can audit each exception.
 *
 * Run with: pnpm exec vitest run src/__tests__/supply-chain-config.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_PATH = path.resolve(
  process.cwd(),
  "pnpm-workspace.yaml"
);

let raw: string;
let lines: string[];

beforeAll(() => {
  if (!fs.existsSync(WORKSPACE_PATH)) {
    throw new Error(`pnpm-workspace.yaml not found at ${WORKSPACE_PATH}`);
  }
  raw = fs.readFileSync(WORKSPACE_PATH, "utf-8");
  lines = raw.split("\n");
});

describe("pnpm-workspace.yaml enforces 24-hour package quarantine (SCHN-01)", () => {
  it("minimumReleaseAge is set to 1440 (24 hours in minutes)", () => {
    // A value of 1440 means pnpm will refuse to install any package
    // published in the last 24 hours — the quarantine window that allows
    // the npm security team to yank malicious packages before propagation.
    expect(raw, "pnpm-workspace.yaml must contain 'minimumReleaseAge: 1440'").toContain(
      "minimumReleaseAge: 1440"
    );
  });
});

describe("pnpm-workspace.yaml detects publisher account downgrade (SCHN-02)", () => {
  it("trustPolicy is set to no-downgrade to detect publisher account takeovers", () => {
    // no-downgrade causes pnpm to error when a package version is signed
    // by a publisher with fewer signing permissions than a prior version —
    // the pattern seen in supply-chain account-compromise attacks.
    expect(raw, "pnpm-workspace.yaml must contain 'trustPolicy: no-downgrade'").toContain(
      "trustPolicy: no-downgrade"
    );
  });
});

describe("pnpm-workspace.yaml blocks exotic sub-dependency resolution (SCHN-03)", () => {
  it("blockExoticSubdeps is set to true to prevent git/tarball transitive installs", () => {
    // Attackers can inject malicious code via git-URL or bare-tarball specifiers
    // in transitive dependency manifests. blockExoticSubdeps: true prevents
    // pnpm from resolving any sub-dependency that is not a registry version.
    expect(raw, "pnpm-workspace.yaml must contain 'blockExoticSubdeps: true'").toContain(
      "blockExoticSubdeps: true"
    );
  });
});

describe("pnpm-workspace.yaml sets audit threshold to block on high CVEs", () => {
  it("auditLevel is set to high so critical and high vulnerabilities fail pnpm install", () => {
    // auditLevel: high means pnpm audit --audit-level high exits non-zero
    // only for high and critical findings, allowing moderate/low to be
    // reported without blocking developers.
    expect(raw, "pnpm-workspace.yaml must contain 'auditLevel: high'").toContain(
      "auditLevel: high"
    );
  });
});

describe("pnpm-workspace.yaml documents all ignored CVE exceptions with rationale (SCHN-01..03)", () => {
  it("auditConfig section with ignoreCves list is present", () => {
    // The auditConfig.ignoreCves list records every CVE that has been
    // deliberately excluded from audit enforcement. Its presence ensures
    // exclusions are visible in code review rather than buried in CI flags.
    expect(raw, "pnpm-workspace.yaml must contain 'auditConfig:' section").toContain(
      "auditConfig:"
    );
    expect(raw, "auditConfig must contain an 'ignoreCves:' list").toContain(
      "ignoreCves:"
    );
  });

  it("every ignored CVE has a rationale comment in the same contiguous group", () => {
    // Without inline rationale, future maintainers cannot evaluate whether
    // an exception is still valid. Each GHSA entry must be covered by a
    // YAML comment (line starting with '#') that precedes either this entry
    // or the first entry in its contiguous group (multiple advisories
    // documented under one shared comment block, e.g. three related ReDoS
    // advisories for the same package).
    //
    // Compliant single entry:
    //   # Next.js RSC deserialization DoS — only affects >=15.0.0 RSC usage.
    //   - GHSA-h25m-26qc-wcjf
    //
    // Compliant group with shared comment:
    //   # minimatch ReDoS (3 advisories) — override not honored in lockfile.
    //   - GHSA-3ppc-4f35-3m26
    //   - GHSA-7r86-cg39-jmmj
    //   - GHSA-23c5-xmqv-rm74
    const ghsaLineIndices: number[] = [];
    lines.forEach((content, index) => {
      if (/^\s*-\s+GHSA-/.test(content)) {
        ghsaLineIndices.push(index);
      }
    });

    expect(
      ghsaLineIndices.length,
      "auditConfig.ignoreCves must contain at least one GHSA entry"
    ).toBeGreaterThan(0);

    for (const idx of ghsaLineIndices) {
      // Walk backwards from this GHSA line to find whether there is a comment
      // between it and the previous non-GHSA, non-blank line (i.e. either a
      // preceding comment, or the group's opening comment). The group boundary
      // is the first line above that is neither a GHSA entry nor a blank line
      // nor a comment — at that point we stop looking.
      let hasComment = false;
      let searchIdx = idx - 1;
      while (searchIdx >= 0) {
        const above = lines[searchIdx].trim();
        if (/^#/.test(above)) {
          // Found a comment — this entry (or its group) is documented
          hasComment = true;
          break;
        } else if (/^-\s+GHSA-/.test(above)) {
          // Another GHSA in the same group; keep scanning upward
          searchIdx--;
        } else if (above === "") {
          // Blank line — stop; no rationale found in this group
          break;
        } else {
          // Any other YAML content (key, list header) — stop
          break;
        }
      }
      const lineNumber = idx + 1; // 1-based for messaging
      expect(
        hasComment,
        `GHSA entry on line ${lineNumber} ("${lines[idx].trim()}") must be covered by a rationale comment above its group`
      ).toBe(true);
    }
  });
});
