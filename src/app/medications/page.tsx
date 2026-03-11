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
import { ClipboardList } from "lucide-react";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";

function MedicationsContent() {
  const [activeTab, setActiveTab] = useState<MedTab>("schedule");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [wizardOpen, setWizardOpen] = useState(false);

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<DoseSlot | null>(null);

  useMedicationNotifications();

  const settings = useSettings();
  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const handleDoseClick = useCallback((slot: DoseSlot) => {
    setSelectedSlot(slot);
    setDoseDetailOpen(true);
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

      {activeTab === "prescriptions" && (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <ClipboardList className="w-16 h-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground text-sm">Prescriptions coming soon</p>
        </div>
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
        slot={selectedSlot}
        isToday={isToday}
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
