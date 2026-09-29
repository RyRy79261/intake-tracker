"use client";

import { useState, useCallback } from "react";
import { useRollingSelectedDate } from "@/hooks/use-today-key";
import { toLocalDateKey } from "@/lib/date-utils";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedTabBar } from "@/components/medications/med-footer";
import { ScheduleView } from "@/components/medications/schedule-view";
import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { CompoundList } from "@/components/medications/compound-list";
import { PrescriptionsView } from "@/components/medications/prescriptions-view";
import { TitrationsView } from "@/components/medications/titrations-view";
import { TitrationStartPrompt } from "@/components/medications/titrations/titration-start-prompt";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";
import { useMedicationUIStore } from "@/stores/medication-ui-store";

/**
 * The Medications screen: tab bar, schedule, Rx, Meds and Titrations. The
 * `/medications` route renders it, and so does the Medications window.
 */
export function MedicationsPageBody() {
  const activeTab = useMedicationUIStore((s) => s.activeTab);
  const setActiveTab = useMedicationUIStore((s) => s.setActiveTab);
  const setWizardOpen = useMedicationUIStore((s) => s.setWizardOpen);
  // Ticks over at midnight, so a screen left open overnight moves its
  // "today" (and a today selection) to the new day.
  const { selectedDate, setSelectedDate, todayKey } = useRollingSelectedDate();

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<DoseSlot | null>(null);

  useMedicationNotifications();

  const selectedKey = toLocalDateKey(selectedDate);
  const isToday = selectedKey === todayKey;
  const isFuture = selectedKey > todayKey;

  const handleDoseClick = useCallback((slot: DoseSlot) => {
    setSelectedSlot(slot);
    setDoseDetailOpen(true);
  }, []);

  const handleAddMed = useCallback(() => {
    setWizardOpen(true);
  }, [setWizardOpen]);

  return (
    <>
      <MedTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "schedule" && (
        <>
          <WeekDaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          {/* A planned titration step waits for the user to confirm it. */}
          <TitrationStartPrompt className="px-1 mb-4" />
          <ScheduleView
            selectedDate={selectedDate}
            onDoseClick={handleDoseClick}
            onAddMed={handleAddMed}
          />
        </>
      )}

      {activeTab === "medications" && (
        <CompoundList onAddMed={handleAddMed} />
      )}

      {activeTab === "prescriptions" && (
        <PrescriptionsView onAddMed={handleAddMed} />
      )}

      {activeTab === "titrations" && <TitrationsView />}

      {activeTab === "settings" && <MedicationSettingsView />}


      <DoseDetailDialog
        open={doseDetailOpen}
        onOpenChange={setDoseDetailOpen}
        slot={selectedSlot}
        isToday={isToday}
        isFuture={isFuture}
      />
    </>
  );
}
