import type { PhaseType } from "./db";

// ---------------------------------------------------------------------------
// Domain & Time
// ---------------------------------------------------------------------------

export type Domain =
  | "water"
  | "salt"
  | "weight"
  | "bp"
  | "eating"
  | "urination"
  | "defecation"
  | "caffeine"
  | "alcohol"
  | "medication";

export type TimeScope = "24h" | "7d" | "30d" | "90d" | "all";

export interface TimeRange {
  start: number; // Unix ms
  end: number; // Unix ms
}

// ---------------------------------------------------------------------------
// Core Data Types
// ---------------------------------------------------------------------------

export interface DataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface AnalyticsResult<T> {
  value: T;
  unit: string;
  period: TimeRange;
  dataPoints: DataPoint[];
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fluid Balance
// ---------------------------------------------------------------------------

export interface FluidBalanceDay {
  date: string;
  intakeMl: number;
  urinationCount: number;
  urinationEstimatedMl: number;
  balance: number;
  target: number;
}

export interface FluidBalanceResult {
  daily: FluidBalanceDay[];
  intraday: DataPoint[];
  avgBalance: number;
  daysAboveTarget: number;
  daysTotal: number;
}

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------

export interface AdherenceResult {
  rate: number;
  taken: number;
  total: number;
  daily: Array<{
    date: string;
    rate: number;
    taken: number;
    total: number;
  }>;
}

// ---------------------------------------------------------------------------
// Blood Pressure
// ---------------------------------------------------------------------------

export interface TrendDirection {
  slope: number;
  direction: "rising" | "falling" | "stable";
  confidence: number;
}

export interface BPTrendResult {
  readings: Array<{
    timestamp: number;
    systolic: number;
    diastolic: number;
    heartRate?: number;
    position: string;
  }>;
  trend: {
    systolic: TrendDirection;
    diastolic: TrendDirection;
  };
  avg: {
    systolic: number;
    diastolic: number;
  };
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export interface WeightTrendResult {
  readings: DataPoint[];
  trend: TrendDirection;
  avg: number;
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------

export interface CorrelationResult {
  coefficient: number;
  strength: "strong" | "moderate" | "weak" | "none";
  seriesA: DataPoint[];
  seriesB: DataPoint[];
  lagDays: number;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export type InsightType =
  | "adherence_drop"
  | "bp_trend"
  | "weight_trend"
  | "fluid_deficit"
  | "correlation_alert"
  | "anomaly";

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  severity: "info" | "warning" | "alert";
  value: number;
  threshold: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Titration Report
// ---------------------------------------------------------------------------

export interface TitrationReport {
  prescriptionId: string;
  prescriptionName: string;
  phases: Array<{
    phaseId: string;
    phaseName: string;
    type: PhaseType;
    startDate: number;
    endDate?: number;
    adherence: AdherenceResult;
    bpDuring: BPTrendResult;
    weightDuring: WeightTrendResult;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Estimated urination volume in ml by amount estimate category */
export const URINATION_ESTIMATE_ML: Record<string, number> = {
  small: 150,
  medium: 300,
  large: 500,
};

/** Default lag in days for salt-vs-weight correlation (per research) */
export const DEFAULT_SALT_WEIGHT_LAG_DAYS = 2;
