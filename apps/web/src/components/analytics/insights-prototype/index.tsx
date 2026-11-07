"use client";

/**
 * PROTOTYPE — throwaway. Round 2: the whole Metrics window in the
 * doctor-report style, three ways to organise it (see metrics-prototype.tsx),
 * switchable via `?variant=` and the floating bar. `?variant=0` shows today's
 * Metrics window for comparison.
 *
 * Read-only: it never writes to Dexie. Hidden in production builds.
 */

import type { ReactNode } from "react";
import { ExportControls } from "@/components/analytics/export-controls";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/prototype/prototype-switcher";
import { usePrototypeInsights } from "@/hooks/use-insights-prototype";
import { METRICS_VARIANTS, MetricsPrototype } from "@/components/analytics/insights-prototype/metrics-prototype";

const VARIANTS = [...METRICS_VARIANTS, { key: "0", name: "Current Metrics" }] as const;
const KEYS = VARIANTS.map((v) => v.key);

export function MetricsWindowPrototype({
  current,
  activeTab,
}: {
  current: ReactNode;
  /** The window's tab. History opens Metrics on "records", which the
   *  prototype hands to today's window (Records moves to History in the build). */
  activeTab: string;
}) {
  const [variant, setVariant] = usePrototypeVariant(KEYS, "1");
  return (
    <>
      {variant === "0" || activeTab === "records" ? (
        current
      ) : (
        <MetricsPrototype
          key={variant}
          variant={variant}
          useInsights={usePrototypeInsights}
          exportSlot={(range) => <ExportControls range={range} />}
        />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </>
  );
}
