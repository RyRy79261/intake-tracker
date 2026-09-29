"use client";

import { MedicationPrefsSection } from "@/components/settings/medication-prefs-section";

/**
 * The legacy Medications page's Settings tab. The controls live in
 * Settings › Medications (MedicationPrefsSection); the Ward Console
 * Medications window has no Settings tab.
 */
export function MedicationSettingsView() {
  return (
    <div className="pb-24">
      <h2 className="mb-1 text-xl font-semibold">Medication Settings</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Configure preferences that apply to your prescriptions and search results.
      </p>
      <div className="flex flex-col gap-3">
        <MedicationPrefsSection />
      </div>
    </div>
  );
}
