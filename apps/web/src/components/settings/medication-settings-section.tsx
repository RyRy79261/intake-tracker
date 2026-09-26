"use client";

import Link from "next/link";
import { ChevronRight, Pill } from "lucide-react";
import { useMedicationUIStore } from "@/stores/medication-ui-store";

/**
 * Medication preferences (regions, reminders, time format) live in one place:
 * the Settings tab of the Medications page. This used to be a second region
 * picker with its own codes ("UK", "Other") that the ISO combobox and the AI
 * medicine search didn't understand, so it now links there instead.
 */
export function MedicationSettingsSection() {
  const setActiveTab = useMedicationUIStore((s) => s.setActiveTab);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
        <Pill className="w-4 h-4" />
        <h3 className="font-semibold">Medication</h3>
      </div>

      <Link
        href="/medications"
        onClick={() => setActiveTab("settings")}
        className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
      >
        <span>
          <span className="block font-medium">Open medication settings</span>
          <span className="block text-xs text-muted-foreground">
            Regions for medicine search, dose reminders and time format
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
