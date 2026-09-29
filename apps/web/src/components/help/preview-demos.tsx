"use client";

import { useCallback, useId, useState } from "react";
import { Plus } from "lucide-react";
import { RecordsTab } from "@/components/analytics/records-tab";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import type { TimeRange, TimeScope } from "@intake/types/analytics";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { CompoundList } from "@/components/medications/compound-list";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { WardMedTabs, wardMedTabId, type WardMedTab } from "@/components/medications/med-tabs";
import { OtherDosesToday } from "@/components/medications/other-doses-today";
import { PrescriptionsView } from "@/components/medications/prescriptions-view";
import { ScheduleView } from "@/components/medications/schedule-view";
import { TitrationsView } from "@/components/medications/titrations-view";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { useTimeScopeRange } from "@/hooks/use-analytics-queries";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { toLocalDateKey } from "@/lib/date-utils";
import { TodayGadget } from "@/components/home/today-gadget";
import { TextMetrics } from "@/components/text-metrics";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Demo compositions for the manual's live previews. They assemble the same
 * components the Medications and Metrics windows use, but keep their state
 * (tab, wizard, selected dose) local: the windows' state lives in global
 * stores, and a demo must not open the wizard in, or switch the tab of, the
 * user's real Medications window.
 */

/** Home's summary: the Today gadget with the Ward Console shell, else TextMetrics. */
export function TodayDemo() {
  const wardShell = useSettingsStore((s) => s.wardShell);
  return wardShell ? <TodayGadget /> : <TextMetrics />;
}

/**
 * Metrics › Records: the range buttons over the records list; tap a row's
 * pencil to edit it. (No export or tab bar: they'd lead out of the demo.)
 */
export function RecordsDemo() {
  const [scope, setScope] = useState<TimeScope>("7d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);
  const scopeRange = useTimeScopeRange(scope);
  return (
    <div className="wm">
      <div className="wm-top">
        <TimeRangeSelector
          scope={scope}
          onScopeChange={setScope}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      </div>
      <div className="wm-stack">
        <RecordsTab range={customRange ?? scopeRange} />
      </div>
    </div>
  );
}

/**
 * The Medications window: its tab bar (the tab is demo-local state, starting
 * on `tab`), the Schedule tab (week strip, doses by time, dose dialog, other
 * doses today), the Rx cards, Meds and Titrations, with the "+" button that
 * opens the Add medication wizard.
 */
export function MedsDemo({ tab: initialTab }: { tab: "schedule" | "prescriptions" }) {
  const [tab, setTab] = useState<WardMedTab>(initialTab);
  const panelId = useId();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [slot, setSlot] = useState<DoseSlot | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const todayKey = toLocalDateKey();
  const selectedKey = toLocalDateKey(selectedDate);

  const openDose = useCallback((next: DoseSlot) => {
    setSlot(next);
    setDetailOpen(true);
  }, []);
  const addMed = useCallback(() => setWizardOpen(true), []);

  return (
    <div>
      {/* The bar bleeds 16px each side (the window's padding); the preview pads 10px. */}
      <div className="px-1.5">
        <WardMedTabs activeTab={tab} onTabChange={setTab} panelId={panelId} />
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={wardMedTabId(panelId, tab)}>
        {tab === "schedule" && (
          <>
            <WeekDaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            <ScheduleView selectedDate={selectedDate} onDoseClick={openDose} onAddMed={addMed} />
            <OtherDosesToday dateKey={selectedKey} isToday={selectedKey === todayKey} />
          </>
        )}
        {tab === "prescriptions" && <PrescriptionsView onAddMed={addMed} />}
        {tab === "medications" && <CompoundList onAddMed={addMed} />}
        {tab === "titrations" && <TitrationsView />}
      </div>

      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={addMed}
          className="flex h-14 w-14 items-center justify-center bg-meds text-on-domain shadow-[0_3px_0_rgba(20,22,31,.22)] dark:shadow-[0_3px_0_rgba(0,0,0,.5)]"
          aria-label="Add medication"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      <DoseDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        slot={slot}
        isToday={selectedKey === todayKey}
        isFuture={selectedKey > todayKey}
      />
      <AddMedicationWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
