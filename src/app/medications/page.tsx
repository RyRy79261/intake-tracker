"use client";

import { useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedFooter, type MedTab } from "@/components/medications/med-footer";
import { ScheduleView } from "@/components/medications/schedule-view";
import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { CompoundList } from "@/components/medications/compound-list";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import type { DoseSlot, DoseLogWithDetails } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";

function MedicationsContent() {
  const [activeTab, setActiveTab] = useState<MedTab>("schedule");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [wizardOpen, setWizardOpen] = useState(false);

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DoseLogWithDetails | null>(null);

  useMedicationNotifications();

  const settings = useSettings();
  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const handleDoseClick = useCallback((slot: DoseSlot) => {
    // Convert DoseSlot to DoseLogWithDetails for DoseDetailDialog compatibility
    if (slot.existingLog) {
      setSelectedEntry({
        log: slot.existingLog,
        prescription: slot.prescription,
        phase: slot.phase,
        schedule: slot.schedule,
        ...(slot.inventory !== undefined && { inventory: slot.inventory }),
      });
      setDoseDetailOpen(true);
    }
  }, []);

  const handleAddMed = useCallback(() => {
    setWizardOpen(true);
  }, []);

  return (
    <>
      <AppHeader
        headerHidden={isHidden}
        transitionDuration={barTransitionSec}
      />

      {activeTab === "schedule" && (
        <>
          <WeekDaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
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

      {activeTab === "settings" && <MedicationSettingsView />}

      <MedFooter
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hidden={isHidden}
        transitionDuration={barTransitionSec}
      />

      <DoseDetailDialog
        open={doseDetailOpen}
        onOpenChange={setDoseDetailOpen}
        entry={selectedEntry}
        date={dateStr}
      />

      <AddMedicationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </>
  );
}

export default function MedicationsPage() {
  return (
    <AuthGuard>
      <MedicationsContent />
    </AuthGuard>
  );
}
