"use client";

import { useState, useCallback } from "react";
import { useRollingSelectedDate } from "@/hooks/use-today-key";
import { toLocalDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedTabBar } from "@/components/medications/med-footer";
import { WardMedTabs } from "@/components/medications/med-tabs";
import { ScheduleView } from "@/components/medications/schedule-view";
import { OtherDosesToday } from "@/components/medications/other-doses-today";
import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { CompoundList } from "@/components/medications/compound-list";
import { PrescriptionsView } from "@/components/medications/prescriptions-view";
import { TitrationsView } from "@/components/medications/titrations-view";
import { TitrationStartPrompt } from "@/components/medications/titrations/titration-start-prompt";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";
import { useMedicationUIStore } from "@/stores/medication-ui-store";

interface MedicationsPageBodyProps {
  /**
   * Rendered in the Ward Console Medications window: the four-tab bar with
   * pips, no Settings tab, and "Other doses today" under the schedule (the
   * window's "+" button logs them). Off, the legacy page is unchanged.
   */
  ward?: boolean;
}

/**
 * The Medications screen: tab bar, schedule, Rx, Meds and Titrations. The
 * `/medications` route renders it, and so does the Medications window.
 */
export function MedicationsPageBody({ ward = false }: MedicationsPageBodyProps) {
  const storedTab = useMedicationUIStore((s) => s.activeTab);
  const setActiveTab = useMedicationUIStore((s) => s.setActiveTab);
  const setWizardOpen = useMedicationUIStore((s) => s.setWizardOpen);
  // TODO(PR 12): the window has no Settings tab; its content moves to
  // Settings › Medications. Until then a "settings" tab left over from the
  // legacy page falls back to Schedule in the window.
  const activeTab = ward && storedTab === "settings" ? "schedule" : storedTab;
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
      {ward && activeTab !== "settings" ? (
        <WardMedTabs activeTab={activeTab} onTabChange={setActiveTab} />
      ) : (
        <MedTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {activeTab === "schedule" && (
        // The "+" button floats over the bottom right corner: leave room under
        // the last row so it never covers a Take button.
        <div className={cn(ward ? "pb-[68px]" : "pb-24")}>
          <WeekDaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          {/* A planned titration step waits for the user to confirm it. */}
          <TitrationStartPrompt className={ward ? "mb-3" : "px-1 mb-4"} />
          <ScheduleView
            selectedDate={selectedDate}
            onDoseClick={handleDoseClick}
            onAddMed={handleAddMed}
          />
          {ward && <OtherDosesToday dateKey={selectedKey} isToday={isToday} />}
        </div>
      )}

      {activeTab === "medications" && (
        <CompoundList onAddMed={handleAddMed} />
      )}

      {activeTab === "prescriptions" && (
        <PrescriptionsView onAddMed={handleAddMed} />
      )}

      {activeTab === "titrations" && <TitrationsView />}

      {!ward && activeTab === "settings" && <MedicationSettingsView />}

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
