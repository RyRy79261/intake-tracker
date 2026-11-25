"use client";

/**
 * PROTOTYPE — throwaway. Round 2: the whole Metrics window in the
 * doctor-report style, three ways to organise it (see metrics-prototype.tsx),
 * switchable via `?variant=` and the floating bar. `?variant=0` shows today's
 * Metrics window for comparison.
 *
 * Read-only: it never writes to Dexie. Shown in every build; the variant
 * switcher and `?variant=0` exist only in development and preview.
 */

import type { ReactNode } from "react";
import { ExportControls } from "@/components/analytics/export-controls";
import { PROTOTYPES_ENABLED, PrototypeSwitcher, usePrototypeVariant } from "@/components/prototype/prototype-switcher";
import { usePrototypeInsights } from "@/hooks/use-insights-prototype";
import { METRICS_VARIANTS, MetricsPrototype } from "@/components/analytics/insights-prototype/metrics-prototype";

const VARIANTS = [...METRICS_VARIANTS, { key: "0", name: "Current Metrics" }] as const;
const KEYS = VARIANTS.map((v) => v.key);

export function MetricsWindowPrototype({
  current,
  activeTab,
}: {
  current: ReactNode;
  /** The window's tab. History opens Metrics on "records", and Records links to
   *  "titration"; both stay in today's window until they get homes of their own. */
  activeTab: string;
}) {
  const [variant, setVariant] = usePrototypeVariant(KEYS, "1");
  const legacyTab = activeTab === "records" || activeTab === "titration";
  return (
    <>
      {(PROTOTYPES_ENABLED && variant === "0") || legacyTab ? (
        current
      ) : (
        <MetricsPrototype
          key={variant}
          variant={variant}
          useInsights={usePrototypeInsights}
          exportSlot={(range) => <ExportControls range={range} />}
        />
      )}
      {/* Records and Titration always show today's window, so a layout picked there would not apply. */}
      {PROTOTYPES_ENABLED && !legacyTab && <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />}
    </>
  );
}
