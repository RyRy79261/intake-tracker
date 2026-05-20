import { describe, it, expect } from "vitest";
import {
  GITHUB_LABELS,
  BUG_ISSUE_LABELS,
  FEATURE_ISSUE_LABELS,
} from "@/lib/github-labels";

describe("github-labels catalogue", () => {
  it("has unique label names", () => {
    const names = GITHUB_LABELS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses valid 6-digit hex colours without a leading #", () => {
    for (const label of GITHUB_LABELS) {
      expect(label.color, label.name).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("gives every label a non-empty description", () => {
    for (const label of GITHUB_LABELS) {
      expect(label.description.length, label.name).toBeGreaterThan(0);
    }
  });

  it("only applies labels that exist in the catalogue", () => {
    const names = new Set(GITHUB_LABELS.map((l) => l.name));
    for (const name of [...BUG_ISSUE_LABELS, ...FEATURE_ISSUE_LABELS]) {
      expect(names.has(name), name).toBe(true);
    }
  });

  it("tags in-app reports with type, triage state and provenance", () => {
    expect(BUG_ISSUE_LABELS).toContain("type: bug");
    expect(BUG_ISSUE_LABELS).toContain("needs-triage");
    expect(BUG_ISSUE_LABELS).toContain("source: in-app");
    expect(FEATURE_ISSUE_LABELS).toContain("type: feature");
  });
});
