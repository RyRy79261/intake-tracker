"use client";

import { useState, useCallback, useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedFooter, type MedTab } from "@/components/medications/med-footer";
import { ScheduleView } from "@/components/medications/schedule-view";
import { StatusView } from "@/components/medications/status-view";
import { MedicationsList } from "@/components/medications/medications-list";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { MarkAllModal } from "@/components/medications/mark-all-modal";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import type { DoseLog, Prescription } from "@/lib/db";
import type { ScheduleWithDetails } from "@/lib/medication-schedule-service";
import { startMedicationNotifications, stopMedicationNotifications } from "@/lib/medication-notification-service";

function MedicationsContent() {
  const [activeTab, setActiveTab] = useState<MedTab>("schedule");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [wizardOpen, setWizardOpen] = useState(false);

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleWithDetails | null>(null);
  const [selectedDoseLog, setSelectedDoseLog] = useState<DoseLog | undefined>(undefined);

  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [markAllTime, setMarkAllTime] = useState("");
  const [markAllEntries, setMarkAllEntries] = useState<ScheduleWithDetails[]>([]);

  useEffect(() => {
    startMedicationNotifications();
    return () => stopMedicationNotifications();
  }, []);

  const settings = useSettings();
  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const handleDoseClick = useCallback((entry: ScheduleWithDetails, log: DoseLog | undefined) => {
    setSelectedEntry(entry);
    setSelectedDoseLog(log);
    setDoseDetailOpen(true);
  }, []);

  const handleMarkAll = useCallback((time: string, entries: ScheduleWithDetails[]) => {
    setMarkAllTime(time);
    setMarkAllEntries(entries);
    setMarkAllOpen(true);
  }, []);

  const handleAddMed = useCallback(() => {
    setWizardOpen(true);
  }, []);

  const handleEditMed = useCallback((_prescription: Prescription) => {
    // TODO: open edit flow
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

      {activeTab === "status" && <StatusView />}

      {activeTab === "medications" && (
        <MedicationsList onAddMed={handleAddMed} onEditMed={handleEditMed} />
      )}

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
        doseLog={selectedDoseLog}
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
