"use client";

/**
 * PROTOTYPE — throwaway. "Three variants of the Metrics insights, switchable
 * via `?variant=`, on the existing Summary tab" (prototype skill, sub-shape A).
 *
 *   ?variant=A  What changed      — this week vs your own baseline
 *   ?variant=B  Timeline          — every measure on one axis + before/after per med change
 *   ?variant=C  Doctor report     — fixed one-pager that prints
 *   ?variant=0  Current Summary   — today's averages, for comparison
 *
 * Read-only: it never writes to Dexie. Hidden in production builds.
 */

import type { TimeRange } from "@intake/types/analytics";
import { SummaryTab } from "@/components/analytics/summary-tab";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/prototype/prototype-switcher";
import { usePrototypeInsights } from "@/hooks/use-insights-prototype";
import { VariantChanges } from "@/components/analytics/insights-prototype/variant-changes";
import { VariantTimeline } from "@/components/analytics/insights-prototype/variant-timeline";
import { VariantReport } from "@/components/analytics/insights-prototype/variant-report";

const VARIANTS = [
  { key: "A", name: "What changed" },
  { key: "B", name: "Timeline" },
  { key: "C", name: "Doctor report" },
  { key: "0", name: "Current summary" },
] as const;
const KEYS = VARIANTS.map((v) => v.key);

export function InsightsPrototype({ range }: { range: TimeRange }) {
  const [variant, setVariant] = usePrototypeVariant(KEYS, "A");
  const data = usePrototypeInsights();

  let body;
  if (variant === "0") body = <SummaryTab range={range} />;
  else if (!data) body = <p className="wm-p" style={{ padding: 14 }}>Loading…</p>;
  else if (variant === "B") body = <VariantTimeline data={data} />;
  else if (variant === "C") body = <VariantReport data={data} />;
  else body = <VariantChanges data={data} />;

  return (
    <>
      {body}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </>
  );
}
