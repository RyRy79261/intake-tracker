"use client";

import { useState, useCallback } from "react";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { MedTabBar } from "@/components/medications/med-footer";
import { ScheduleView } from "@/components/medications/schedule-view";
import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { CompoundList } from "@/components/medications/compound-list";
import { PrescriptionsView } from "@/components/medications/prescriptions-view";
import { TitrationsView } from "@/components/medications/titrations-view";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";
import { useMedicationUIStore } from "@/stores/medication-ui-store";

function MedicationsContent() {
  const activeTab = useMedicationUIStore((s) => s.activeTab);
  const setActiveTab = useMedicationUIStore((s) => s.setActiveTab);
  const setWizardOpen = useMedicationUIStore((s) => s.setWizardOpen);
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<DoseSlot | null>(null);

  useMedicationNotifications();

  const isToday = selectedDate.toDateString() === new Date().toDateString();

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
      />
    </>
  );
}

export default function MedicationsPage() {
  return <MedicationsContent />;
}
