// Re-export shim. The analytics stat functions moved to @intake/core in
// Phase 3.1 (the purity wall — correlateTimeSeries now takes an injected
// `timezone`). Existing `@/lib/analytics-stats` importers resolve unchanged.
export {
  movingAverage,
  trend,
  correlateTimeSeries,
  detectAnomalies,
  computeRegression,
} from "@intake/core/analytics-stats";
