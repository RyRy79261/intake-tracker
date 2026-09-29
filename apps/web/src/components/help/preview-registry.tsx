import type { ReactNode } from "react";
import type { AppDatabase } from "@/lib/db";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { MedsDemo, RecordsDemo, TodayDemo } from "@/components/help/preview-demos";
import {
  seedBathroomPreview,
  seedBloodPressurePreview,
  seedFoodSaltPreview,
  seedLiquidsPreview,
  seedMedicationsPreview,
  seedRecordsPreview,
  seedTodayPreview,
  seedWeightPreview,
} from "@/lib/help/preview-data";

/**
 * Registry of live, interactive component previews shown inside manual pages,
 * keyed by manual slug. A manual with an entry here renders the real app
 * component against an isolated, fixture-seeded database.
 */
export interface ManualPreview {
  /** The real app component(s) to render live. */
  render: () => ReactNode;
  /** Seeds the isolated preview database with sample data. */
  seed: (database: AppDatabase) => Promise<void>;
}

const MANUAL_PREVIEWS: Record<string, ManualPreview> = {
  "how-it-works": {
    render: () => <TodayDemo />,
    seed: seedTodayPreview,
  },
  "logging-drinks": {
    render: () => <LiquidsCard />,
    seed: seedLiquidsPreview,
  },
  "food-and-sodium": {
    render: () => <FoodSaltCard />,
    seed: seedFoodSaltPreview,
  },
  "blood-pressure": {
    render: () => <BloodPressureCard />,
    seed: seedBloodPressurePreview,
  },
  weight: {
    render: () => <WeightCard />,
    seed: seedWeightPreview,
  },
  "urination-and-bowel": {
    render: () => (
      <div className="flex flex-col gap-2.5">
        <UrinationCard />
        <DefecationCard />
      </div>
    ),
    seed: seedBathroomPreview,
  },
  "editing-entries": {
    render: () => <RecordsDemo />,
    seed: seedRecordsPreview,
  },
  "adding-medication": {
    render: () => <MedsDemo tab="prescriptions" />,
    seed: seedMedicationsPreview,
  },
  "medication-schedule": {
    render: () => <MedsDemo tab="schedule" />,
    seed: seedMedicationsPreview,
  },
};

/** Manual slugs that have a live preview. */
export const PREVIEW_SLUGS: readonly string[] = Object.keys(MANUAL_PREVIEWS);

export function getManualPreview(slug: string): ManualPreview | undefined {
  return Object.hasOwn(MANUAL_PREVIEWS, slug) ? MANUAL_PREVIEWS[slug] : undefined;
}
