import { describe, it, expect } from "vitest";
import {
  AnalyticsInsightsRequestSchema,
  buildInsightsPrompt,
} from "@/lib/analytics-insights";

const validBp = {
  avgSystolic: 128,
  avgDiastolic: 82,
  readingCount: 14,
  systolicTrend: { direction: "rising", slope: 0.5, confidence: 0.7 },
  diastolicTrend: { direction: "stable", slope: 0.01, confidence: 0.1 },
};

describe("AnalyticsInsightsRequestSchema", () => {
  it("accepts a payload with a single metric group", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: { bp: validBp },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with no metric groups", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty correlations array as the only metric", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: { correlations: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown correlation domain", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: {
        correlations: [
          {
            domainA: "water",
            domainB: "sleep",
            coefficient: 0.5,
            strength: "moderate",
            pairedDays: 5,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a correlation coefficient outside [-1, 1]", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: {
        correlations: [
          {
            domainA: "water",
            domainB: "weight",
            coefficient: 1.5,
            strength: "strong",
            pairedDays: 5,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional profile with conditions", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      profile: { conditions: ["HFrEF", "Idiopathic dilated cardiomyopathy"] },
      metrics: { bp: validBp },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a profile whose only context is present but has no metrics", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      profile: { conditions: ["HFrEF"] },
      metrics: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("buildInsightsPrompt", () => {
  it("includes BP numbers and treats a low-confidence trend as inconclusive", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("128/82 mmHg");
    expect(prompt).toContain("14 reading");
    // diastolic trend confidence 0.1 is below the 0.3 gate.
    expect(prompt).toContain("no clear trend");
  });

  it("includes user-reported conditions when a profile is supplied", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      profile: { conditions: ["HFrEF", "Idiopathic dilated cardiomyopathy"] },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("User-reported medical conditions");
    expect(prompt).toContain("HFrEF");
    expect(prompt).toContain("Idiopathic dilated cardiomyopathy");
  });

  it("includes active medications when supplied in the profile", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      profile: {
        conditions: [],
        medications: [
          {
            name: "Bisoprolol",
            phaseType: "titration",
            dose: "2.5 mg",
            frequency: "once daily",
            daysOnPhase: 12,
          },
        ],
      },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("Current medications");
    expect(prompt).toContain("Bisoprolol");
    expect(prompt).toContain("titration phase");
    expect(prompt).toContain("2.5 mg");
    expect(prompt).toContain("12 day(s)");
  });

  it("omits the conditions line when no profile is supplied", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).not.toContain("User-reported medical conditions");
  });

  it("flags a correlation with fewer than 3 paired days as insufficient data", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 86_400_000 },
      metrics: {
        correlations: [
          {
            domainA: "salt",
            domainB: "weight",
            coefficient: 0,
            strength: "none",
            pairedDays: 2,
          },
        ],
      },
    });
    const prompt = buildInsightsPrompt(req);
    expect(prompt).toContain("insufficient overlapping data");
  });
});
