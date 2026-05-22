import type { ReactNode } from "react";
import type { AppDatabase } from "@/lib/db";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import {
  seedBloodPressurePreview,
  seedWeightPreview,
} from "@/lib/help/preview-data";

/**
 * Registry of live, interactive component previews shown inside manual pages,
 * keyed by manual slug. A manual with an entry here renders the real app
 * component against an isolated, fixture-seeded database.
 */
export interface ManualPreview {
  /** The real app component to render live. */
  render: () => ReactNode;
  /** Seeds the isolated preview database with sample data. */
  seed: (database: AppDatabase) => Promise<void>;
}

const MANUAL_PREVIEWS: Record<string, ManualPreview> = {
  "blood-pressure": {
    render: () => <BloodPressureCard />,
    seed: seedBloodPressurePreview,
  },
  weight: {
    render: () => <WeightCard />,
    seed: seedWeightPreview,
  },
};

export function getManualPreview(slug: string): ManualPreview | undefined {
  return MANUAL_PREVIEWS[slug];
}
