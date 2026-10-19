"use client";

import { useLiveQuery } from "@/hooks/use-live-query";
import { getPrescriptions } from "@/lib/prescription-service";
import { getAllInventoryItems } from "@/lib/inventory-service";
import { getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import type { VoiceMedicationContext } from "@/lib/voice-medication";

/** The medication list and the dose slots of `dates`, for planning voice medication items. */
export async function loadVoiceMedicationContext(dates: string[]): Promise<VoiceMedicationContext> {
  const [prescriptions, inventory, slots] = await Promise.all([
    getPrescriptions(),
    getAllInventoryItems(),
    Promise.all(dates.map((d) => getDailyDoseSchedule(d))),
  ]);
  const slotsByDate: VoiceMedicationContext["slotsByDate"] = {};
  dates.forEach((d, i) => {
    slotsByDate[d] = slots[i] ?? [];
  });
  return { prescriptions, inventory, slotsByDate };
}

/** {@link loadVoiceMedicationContext}, live. Undefined while loading. */
export function useVoiceMedicationContext(dates: string[]): VoiceMedicationContext | undefined {
  const key = dates.join(",");
  // `key` stands for `dates`, which is a new array each render.
  return useLiveQuery(() => loadVoiceMedicationContext(dates), [key]);
}
