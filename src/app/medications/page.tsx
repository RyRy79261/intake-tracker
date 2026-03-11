"use client";

import { useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedFooter, type MedTab } from "@/components/medications/med-footer";
import { ScheduleView } from "@/components/medications/schedule-view";
import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { MarkAllModal } from "@/components/medications/mark-all-modal";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { CompoundList } from "@/components/medications/compound-list";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import type { DoseLog } from "@/lib/db";
import type { DoseLogWithDetails } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";

function MedicationsContent() {
  const [activeTab, setActiveTab] = useState<MedTab>("schedule");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [wizardOpen, setWizardOpen] = useState(false);

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DoseLogWithDetails | null>(null);
  const [selectedDoseLog, setSelectedDoseLog] = useState<DoseLog | undefined>(undefined);

  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [markAllTime, setMarkAllTime] = useState("");
  const [markAllEntries, setMarkAllEntries] = useState<DoseLogWithDetails[]>([]);

  useMedicationNotifications();

  const settings = useSettings();
  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const handleDoseClick = useCallback((entry: DoseLogWithDetails) => {
    setSelectedEntry(entry);
    setSelectedDoseLog(entry.log);
    setDoseDetailOpen(true);
  }, []);

  const handleMarkAll = useCallback((time: string, entries: DoseLogWithDetails[]) => {
    setMarkAllTime(time);
    setMarkAllEntries(entries);
    setMarkAllOpen(true);
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
            onMarkAll={handleMarkAll}
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

      <MarkAllModal
        open={markAllOpen}
        onOpenChange={setMarkAllOpen}
        time={markAllTime}
        entries={markAllEntries}
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
