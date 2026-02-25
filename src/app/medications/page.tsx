"use client";

import { useState, useCallback, useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedFooter, type MedTab } from "@/components/medications/med-footer";
import { ScheduleView } from "@/components/medications/schedule-view";
import { StatusView } from "@/components/medications/status-view";
import { MedicationsList } from "@/components/medications/medications-list";
import { PrescriptionsList } from "@/components/medications/prescriptions-list";
import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { MarkAllModal } from "@/components/medications/mark-all-modal";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import { PrescriptionViewDrawer } from "@/components/medications/edit-medication-drawer";
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

  const [editCompoundOpen, setEditCompoundOpen] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);

  const [editInventoryOpen, setEditInventoryOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<any>(null); // Will type properly later

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

  const handleEditCompound = useCallback((prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setEditCompoundOpen(true);
  }, []);

  const handleEditInventory = useCallback((item: any) => {
    setSelectedInventory(item);
    setEditInventoryOpen(true);
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

      {activeTab === "prescriptions" && (
        <PrescriptionsList onAddCompound={() => {}} onEditCompound={handleEditCompound} />
      )}

      {activeTab === "medications" && (
        <MedicationsList onAddMed={handleAddMed} onEditMed={handleEditInventory} />
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

      <PrescriptionViewDrawer
        open={editCompoundOpen}
        onOpenChange={setEditCompoundOpen}
        prescription={selectedPrescription}
      />

      <InventoryItemViewDrawer
        open={editInventoryOpen}
        onOpenChange={setEditInventoryOpen}
        prescription={selectedInventory}
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
