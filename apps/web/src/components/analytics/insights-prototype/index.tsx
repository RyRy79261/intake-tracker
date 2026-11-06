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
import { RecordsTab } from "@/components/analytics/records-tab";
import { ExportControls } from "@/components/analytics/export-controls";
import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { NutrientAnalysisCard } from "@/components/analytics/nutrient-analysis-card";
import type { FilterType } from "@/lib/history-types";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/prototype/prototype-switcher";
import { usePrototypeInsights } from "@/hooks/use-insights-prototype";
import { METRICS_VARIANTS, MetricsPrototype } from "@/components/analytics/insights-prototype/metrics-prototype";

const VARIANTS = [...METRICS_VARIANTS, { key: "0", name: "Current Metrics" }] as const;
const KEYS = VARIANTS.map((v) => v.key);

export function MetricsWindowPrototype({
  current,
  recordsFilter,
  onRecordsFilterChange,
}: {
  current: ReactNode;
  recordsFilter?: FilterType | undefined;
  onRecordsFilterChange?: ((filter: FilterType) => void) | undefined;
}) {
  const [variant, setVariant] = usePrototypeVariant(KEYS, "A");
  return (
    <>
      {variant === "0" ? (
        current
      ) : (
        <MetricsPrototype
          key={variant}
          variant={variant}
          useInsights={usePrototypeInsights}
          records={(range) => <RecordsTab range={range} filter={recordsFilter} onFilterChange={onRecordsFilterChange} />}
          exportSlot={(range) => <ExportControls range={range} />}
          aiInsights={<AiInsightsCard />}
          nutrientAnalysis={<NutrientAnalysisCard />}
        />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </>
  );
}
