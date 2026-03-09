import { z } from "zod";
import type { AnalyticsResult, Domain } from "./analytics-types";
import {
  fluidBalance,
  adherenceRate,
  bpTrend,
  weightTrend,
  saltVsWeight,
  caffeineVsBP,
  alcoholVsBP,
  correlate,
} from "./analytics-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryDescriptor {
  id: string;
  name: string;
  description: string;
  category: "fluid" | "medication" | "vitals" | "correlation" | "custom";
  parameters: z.ZodSchema;
  execute: (params: Record<string, unknown>) => Promise<AnalyticsResult<unknown>>;
}

// ---------------------------------------------------------------------------
// Parameter Schemas
// ---------------------------------------------------------------------------

const domains: [Domain, ...Domain[]] = [
  "water",
  "salt",
  "weight",
  "bp",
  "eating",
  "urination",
  "defecation",
  "caffeine",
  "alcohol",
  "medication",
];

export const TimeRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
});

export const AdherenceParamsSchema = z.object({
  start: z.number(),
  end: z.number(),
  prescriptionId: z.string().optional(),
});

export const SaltWeightParamsSchema = z.object({
  start: z.number(),
  end: z.number(),
  lagDays: z.number().optional(),
});

export const CorrelationParamsSchema = z.object({
  start: z.number(),
  end: z.number(),
  domainA: z.enum(domains),
  domainB: z.enum(domains),
  lagDays: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const queryRegistry: QueryDescriptor[] = [
  {
    id: "fluid_balance",
    name: "Fluid Balance",
    description:
      "Daily fluid balance showing water intake vs estimated urination output, with intraday running totals and target adherence.",
    category: "fluid",
    parameters: TimeRangeSchema,
    execute: async (params) => {
      const { start, end } = TimeRangeSchema.parse(params);
      return fluidBalance({ start, end });
    },
  },
  {
    id: "adherence_rate",
    name: "Medication Adherence",
    description:
      "Medication adherence rate as a ratio of taken vs scheduled doses, with daily breakdown. Optionally filtered by prescription.",
    category: "medication",
    parameters: AdherenceParamsSchema,
    execute: async (params) => {
      const { start, end, prescriptionId } =
        AdherenceParamsSchema.parse(params);
      return adherenceRate({ start, end }, prescriptionId);
    },
  },
  {
    id: "bp_trend",
    name: "Blood Pressure Trend",
    description:
      "Blood pressure trend analysis with systolic/diastolic averages, linear regression direction, and individual readings.",
    category: "vitals",
    parameters: TimeRangeSchema,
    execute: async (params) => {
      const { start, end } = TimeRangeSchema.parse(params);
      return bpTrend({ start, end });
    },
  },
  {
    id: "weight_trend",
    name: "Weight Trend",
    description:
      "Weight trend analysis with min/max/average, linear regression direction, and individual readings over time.",
    category: "vitals",
    parameters: TimeRangeSchema,
    execute: async (params) => {
      const { start, end } = TimeRangeSchema.parse(params);
      return weightTrend({ start, end });
    },
  },
  {
    id: "salt_vs_weight",
    name: "Salt vs Weight Correlation",
    description:
      "Pearson correlation between daily salt intake and weight with configurable lag (default 2 days) to detect delayed effects.",
    category: "correlation",
    parameters: SaltWeightParamsSchema,
    execute: async (params) => {
      const { start, end, lagDays } = SaltWeightParamsSchema.parse(params);
      return saltVsWeight({ start, end }, lagDays);
    },
  },
  {
    id: "caffeine_vs_bp",
    name: "Caffeine vs BP Correlation",
    description:
      "Pearson correlation between daily caffeine intake (mg) and systolic blood pressure readings.",
    category: "correlation",
    parameters: TimeRangeSchema,
    execute: async (params) => {
      const { start, end } = TimeRangeSchema.parse(params);
      return caffeineVsBP({ start, end });
    },
  },
  {
    id: "alcohol_vs_bp",
    name: "Alcohol vs BP Correlation",
    description:
      "Pearson correlation between daily alcohol intake (standard drinks) and systolic blood pressure readings.",
    category: "correlation",
    parameters: TimeRangeSchema,
    execute: async (params) => {
      const { start, end } = TimeRangeSchema.parse(params);
      return alcoholVsBP({ start, end });
    },
  },
  {
    id: "custom_correlation",
    name: "Custom Domain Correlation",
    description:
      "Pearson correlation between any two health domains with optional lag. Supports all tracked domains: water, salt, weight, bp, eating, urination, defecation, caffeine, alcohol, medication.",
    category: "custom",
    parameters: CorrelationParamsSchema,
    execute: async (params) => {
      const { start, end, domainA, domainB, lagDays } =
        CorrelationParamsSchema.parse(params);
      const result = await correlate(domainA, domainB, { start, end }, lagDays);
      return {
        value: result,
        unit: "correlation",
        period: { start, end },
        dataPoints: result.seriesA,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a query descriptor by its unique ID.
 */
export function getQueryById(id: string): QueryDescriptor | undefined {
  return queryRegistry.find((q) => q.id === id);
}

/**
 * List all available queries with minimal metadata (suitable for AI discovery).
 */
export function listQueries(): Array<{
  id: string;
  name: string;
  description: string;
  category: string;
}> {
  return queryRegistry.map(({ id, name, description, category }) => ({
    id,
    name,
    description,
    category,
  }));
}
