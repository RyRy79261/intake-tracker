import { describe, it, expect } from "vitest";
import {
  queryRegistry,
  getQueryById,
  listQueries,
  TimeRangeSchema,
  AdherenceParamsSchema,
  SaltWeightParamsSchema,
  CorrelationParamsSchema,
} from "./analytics-registry";

const EXPECTED_IDS = [
  "fluid_balance",
  "adherence_rate",
  "bp_trend",
  "weight_trend",
  "salt_vs_weight",
  "caffeine_vs_bp",
  "alcohol_vs_bp",
  "custom_correlation",
] as const;

describe("analytics-registry", () => {
  // -----------------------------------------------------------------------
  // Registry completeness
  // -----------------------------------------------------------------------

  it("has exactly 8 entries", () => {
    expect(queryRegistry).toHaveLength(8);
  });

  it("contains all expected query IDs", () => {
    const ids = queryRegistry.map((q) => q.id);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
  });

  // -----------------------------------------------------------------------
  // Zod parameter schema validation
  // -----------------------------------------------------------------------

  it("each entry has a valid Zod schema that can parse valid params", () => {
    const validParams: Record<string, Record<string, unknown>> = {
      fluid_balance: { start: 1000, end: 2000 },
      adherence_rate: { start: 1000, end: 2000, prescriptionId: "rx-1" },
      bp_trend: { start: 1000, end: 2000 },
      weight_trend: { start: 1000, end: 2000 },
      salt_vs_weight: { start: 1000, end: 2000, lagDays: 3 },
      caffeine_vs_bp: { start: 1000, end: 2000 },
      alcohol_vs_bp: { start: 1000, end: 2000 },
      custom_correlation: {
        start: 1000,
        end: 2000,
        domainA: "water",
        domainB: "salt",
        lagDays: 1,
      },
    };

    for (const entry of queryRegistry) {
      const params = validParams[entry.id];
      expect(params, `Missing test params for ${entry.id}`).toBeDefined();
      expect(() => entry.parameters.parse(params)).not.toThrow();
    }
  });

  // -----------------------------------------------------------------------
  // getQueryById
  // -----------------------------------------------------------------------

  it("getQueryById returns correct entry for each ID", () => {
    for (const id of EXPECTED_IDS) {
      const result = getQueryById(id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(id);
    }
  });

  it("getQueryById returns undefined for unknown ID", () => {
    expect(getQueryById("nonexistent_query")).toBeUndefined();
    expect(getQueryById("")).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // listQueries
  // -----------------------------------------------------------------------

  it("listQueries returns array with id, name, description, category for each entry", () => {
    const list = listQueries();
    expect(list).toHaveLength(8);

    for (const item of list) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("category");
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(typeof item.category).toBe("string");
    }
  });

  // -----------------------------------------------------------------------
  // Description quality (AI agent needs meaningful descriptions)
  // -----------------------------------------------------------------------

  it("every query has a non-empty description", () => {
    for (const entry of queryRegistry) {
      expect(
        entry.description.length,
        `${entry.id} has empty description`,
      ).toBeGreaterThan(10);
    }
  });

  // -----------------------------------------------------------------------
  // Schema-specific tests
  // -----------------------------------------------------------------------

  it("TimeRangeSchema rejects missing fields", () => {
    expect(() => TimeRangeSchema.parse({})).toThrow();
    expect(() => TimeRangeSchema.parse({ start: 1 })).toThrow();
  });

  it("AdherenceParamsSchema allows optional prescriptionId", () => {
    expect(() =>
      AdherenceParamsSchema.parse({ start: 1, end: 2 }),
    ).not.toThrow();
    expect(() =>
      AdherenceParamsSchema.parse({ start: 1, end: 2, prescriptionId: "rx" }),
    ).not.toThrow();
  });

  it("CorrelationParamsSchema validates domain enum values", () => {
    expect(() =>
      CorrelationParamsSchema.parse({
        start: 1,
        end: 2,
        domainA: "water",
        domainB: "salt",
      }),
    ).not.toThrow();
    expect(() =>
      CorrelationParamsSchema.parse({
        start: 1,
        end: 2,
        domainA: "invalid_domain",
        domainB: "salt",
      }),
    ).toThrow();
  });

  it("SaltWeightParamsSchema allows optional lagDays", () => {
    expect(() =>
      SaltWeightParamsSchema.parse({ start: 1, end: 2 }),
    ).not.toThrow();
    expect(() =>
      SaltWeightParamsSchema.parse({ start: 1, end: 2, lagDays: 5 }),
    ).not.toThrow();
  });
});
