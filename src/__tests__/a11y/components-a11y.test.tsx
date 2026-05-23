// @vitest-environment jsdom
/**
 * Accessibility scan of the dashboard components, run via axe-core
 * inside jsdom.
 *
 * Why jsdom and not the existing e2e/a11y.spec.ts: the Playwright spec
 * needs a running webServer with a real Neon Auth session and a
 * Postgres backend. This file gives us *partial* accessibility coverage
 * that runs in the regular vitest suite — fast, deterministic, no
 * external services. The Playwright spec stays the source of truth for
 * full-page coverage (interaction order, focus management, route-level
 * landmarks); this file catches the per-component violations that
 * cause most of the noise.
 *
 * What axe-core does in jsdom: it walks the rendered DOM and runs the
 * subset of rules that don't need layout (colour contrast, real focus
 * tracking, etc. are skipped or degraded — those still need the
 * Playwright run). It catches missing labels, missing ARIA roles,
 * mismatched aria-labelledby targets, duplicated ids, broken
 * landmarks, button-without-name, link-without-name, image-without-alt.
 *
 * Per the @deque/axe-core impact taxonomy:
 *   critical → blocks users with disabilities entirely
 *   serious  → major barrier for some users
 *   moderate → notable friction
 *   minor    → polish
 *
 * This is a TRIAGE tool, not a gate. The first run surfaces existing
 * violations across the codebase that no test has ever enforced; the
 * sensible move is to log them, decide what to fix, then ratchet the
 * gate upward over time. So this test always passes — the value is
 * the structured console output that lists violations by component
 * and impact level. Wire a failure threshold in once the baseline is
 * clean.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import axe from "axe-core";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// Auth gate open for the food card so the AI input renders too.
vi.mock("@/components/auth-guard", async (importActual) => {
  const actual = await importActual<typeof import("@/components/auth-guard")>();
  return { ...actual, useAuthGate: () => true };
});

import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";

interface AxeViolation {
  id: string;
  impact?: "critical" | "serious" | "moderate" | "minor" | null;
  help: string;
  helpUrl: string;
  nodes: { target: string[]; html: string; failureSummary?: string }[];
}

/**
 * Configure axe-core: WCAG 2.1 AA is the floor most teams target. We
 * skip "best-practice" because it produces a lot of low-signal noise
 * against Radix-based UIs. Colour-contrast is disabled because jsdom
 * doesn't compute layout/styles and the rule would either silently
 * pass (false negatives) or noisily warn — the Playwright spec is the
 * right place for contrast checks.
 */
const AXE_CONFIG: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: {
    "color-contrast": { enabled: false },
    // Region rule requires a landmark; individual cards aren't full
    // pages and routinely fail this. The Playwright spec catches it
    // at the page level.
    region: { enabled: false },
  },
};

async function scan(label: string, container: HTMLElement): Promise<AxeViolation[]> {
  const results = await axe.run(container, AXE_CONFIG);
  const violations = results.violations as unknown as AxeViolation[];

  const critical = violations.filter((v) => v.impact === "critical");
  const serious = violations.filter((v) => v.impact === "serious");
  const moderate = violations.filter((v) => v.impact === "moderate");
  const minor = violations.filter((v) => v.impact === "minor");

  if (critical.length + serious.length + moderate.length + minor.length > 0) {
    const summarise = (vs: AxeViolation[], level: string) =>
      vs.length === 0
        ? `${level}=0`
        : `${level}=${vs.length} (${vs.map((v) => `${v.id}×${v.nodes.length}`).join(", ")})`;

    console.log(
      `[a11y][${label}] ${summarise(critical, "critical")} | ${summarise(serious, "serious")} | ${summarise(moderate, "moderate")} | ${summarise(minor, "minor")}`,
    );

    // For critical and serious findings, dump enough detail to triage
    // without re-running. One representative offending node per rule —
    // they're typically all instances of the same root cause.
    for (const v of [...critical, ...serious]) {
      const sample = v.nodes[0];
      if (!sample) continue;
      console.log(
        `[a11y][${label}]   ${v.impact}: ${v.id} — ${v.help}`,
      );
      console.log(
        `[a11y][${label}]     example HTML: ${sample.html.replace(/\s+/g, " ").slice(0, 160)}`,
      );
      console.log(
        `[a11y][${label}]     see: ${v.helpUrl.split("?")[0]}`,
      );
    }
  }

  return critical;
}

const CARDS: { label: string; element: () => React.ReactElement }[] = [
  { label: "LiquidsCard", element: () => <LiquidsCard /> },
  { label: "FoodSaltCard", element: () => <FoodSaltCard /> },
  { label: "BloodPressureCard", element: () => <BloodPressureCard /> },
  { label: "WeightCard", element: () => <WeightCard /> },
  { label: "UrinationCard", element: () => <UrinationCard /> },
  { label: "DefecationCard", element: () => <DefecationCard /> },
];

describe("a11y scan of dashboard components (jsdom + axe-core)", () => {
  for (const card of CARDS) {
    it(`${card.label} — a11y triage scan`, async () => {
      const { container } = await renderWithFixtures(card.element());
      // Brief wait for any async render (useEffect, live query) to settle.
      await new Promise((r) => setTimeout(r, 50));
      // scan() logs findings and returns the critical violations. We
      // deliberately don't assert on the count — this is triage, not a
      // gate. The container needs to actually render *something* though.
      await scan(card.label, container);
      expect(container.children.length).toBeGreaterThan(0);
    }, 15_000);
  }
});
