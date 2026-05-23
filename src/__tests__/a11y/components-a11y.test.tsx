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
 * Failure model: this test FAILS the suite on any `critical`-impact
 * violation. `serious`, `moderate`, and `minor` violations are logged
 * for triage so they're visible in the test output but don't gate CI.
 * As violations get cleaned up, ratchet the gate upward by including
 * the next impact level in the assertion.
 *
 * History: initial run found 3 critical (`button-name`) and 2 serious
 * (`aria-progressbar-name`) violations across LiquidsCard, FoodSaltCard,
 * and WeightCard. All critical and serious were fixed in the same
 * commit that ratcheted this test from triage tool to gate.
 *
 * Round 2: extended to cover medications-page components after the
 * Playwright a11y run (e2e/a11y.spec.ts) caught a button-name
 * violation in WeekDaySelector that this jsdom triage had missed —
 * it was scanning only dashboard cards. Adding the per-component
 * coverage means the next regression of the same shape fails in
 * fast feedback (vitest, <1 s/test) instead of the slow Playwright
 * job. See commit `edad451` for the original WeekDaySelector fix.
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
// Medications-page components (round 2 — see file-level history).
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedTabBar } from "@/components/medications/med-footer";
import { EmptySchedule } from "@/components/medications/empty-schedule";
import { CompoundList } from "@/components/medications/compound-list";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
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

const COMPONENTS: { label: string; element: () => React.ReactElement }[] = [
  // Dashboard cards (round 1)
  { label: "LiquidsCard", element: () => <LiquidsCard /> },
  { label: "FoodSaltCard", element: () => <FoodSaltCard /> },
  { label: "BloodPressureCard", element: () => <BloodPressureCard /> },
  { label: "WeightCard", element: () => <WeightCard /> },
  { label: "UrinationCard", element: () => <UrinationCard /> },
  { label: "DefecationCard", element: () => <DefecationCard /> },
  // Medications-page components (round 2)
  {
    label: "WeekDaySelector",
    element: () => (
      <WeekDaySelector selectedDate={new Date()} onSelectDate={() => {}} />
    ),
  },
  {
    label: "MedTabBar",
    element: () => (
      <MedTabBar activeTab="schedule" onTabChange={() => {}} />
    ),
  },
  {
    label: "EmptySchedule",
    element: () => <EmptySchedule onAddMed={() => {}} />,
  },
  {
    label: "CompoundList",
    element: () => <CompoundList onAddMed={() => {}} />,
  },
  {
    label: "AddMedicationWizard (open)",
    element: () => (
      <AddMedicationWizard open onOpenChange={() => {}} />
    ),
  },
];

describe("a11y scan of dashboard + medications components (jsdom + axe-core)", () => {
  for (const card of COMPONENTS) {
    it(`${card.label} has no critical a11y violations`, async () => {
      const { container } = await renderWithFixtures(card.element());
      // Brief wait for any async render (useEffect, live query) to settle.
      await new Promise((r) => setTimeout(r, 50));
      const critical = await scan(card.label, container);
      expect(
        critical,
        critical.length
          ? `critical violations on ${card.label}: ${critical
              .map((v) => `${v.id} (${v.nodes.length} nodes) → ${v.helpUrl.split("?")[0]}`)
              .join("; ")}`
          : undefined,
      ).toEqual([]);
    }, 15_000);
  }
});
