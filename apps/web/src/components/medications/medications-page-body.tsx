"use client";

import { useState, useCallback, useEffect, useId, useRef } from "react";
import { useRollingSelectedDate } from "@/hooks/use-today-key";
import { toLocalDateKey } from "@/lib/date-utils";
import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { WardMedTabs, wardMedTabId } from "@/components/medications/med-tabs";
import { ScheduleView } from "@/components/medications/schedule-view";
import { OtherDosesToday } from "@/components/medications/other-doses-today";
import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { CompoundList } from "@/components/medications/compound-list";
import { PrescriptionsView } from "@/components/medications/prescriptions-view";
import { AboutMedicineView } from "@/components/medications/about-medicine-view";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import { TitrationsView } from "@/components/medications/titrations-view";
import { TitrationStartPrompt } from "@/components/medications/titrations/titration-start-prompt";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { useMedicationNotifications } from "@/hooks/use-medication-notifications";
import { useMedicationUIStore } from "@/stores/medication-ui-store";

/**
 * The Medications window: the four-tab bar with pips (Schedule, Rx, Meds,
 * Titrations) and its panels, with "Other doses today" under the schedule
 * (the window's "+" button logs them). Medication preferences live in the
 * global Settings sheet (Settings › Medications).
 */
export function MedicationsPageBody() {
  const activeTab = useMedicationUIStore((s) => s.activeTab);
  const setActiveTab = useMedicationUIStore((s) => s.setActiveTab);
  const setWizardOpen = useMedicationUIStore((s) => s.setWizardOpen);
  const panelId = useId();
  // Ticks over at midnight, so a screen left open overnight moves its
  // "today" (and a today selection) to the new day.
  const { selectedDate, setSelectedDate, todayKey } = useRollingSelectedDate();

  const [doseDetailOpen, setDoseDetailOpen] = useState(false);
  // "About this medicine" replaces the tabs while open (the prototype's
  // in-window sub-view). The Rx tab stays mounted underneath, hidden, so its
  // expanded card is still open on the way back.
  const [aboutId, setAboutId] = useState<string | null>(null);
  const prescriptions = usePrescriptions();
  const aboutRx =
    aboutId && activeTab === "prescriptions"
      ? (prescriptions.find((p) => p.id === aboutId) ?? null)
      : null;
  const [selectedSlot, setSelectedSlot] = useState<DoseSlot | null>(null);

  // Closing About gives focus back to the card's "About this medicine"
  // button (`data-about-opener`), which was hidden while About was open.
  // Otherwise focus is lost with the unmounted Back button. Found by its
  // attribute, not `document.activeElement`: Safari does not focus a button
  // on click.
  const tabsRef = useRef<HTMLDivElement>(null);
  const lastAboutId = useRef<string | null>(null);
  const openAboutId = aboutRx?.id ?? null;
  useEffect(() => {
    if (openAboutId) {
      lastAboutId.current = openAboutId;
      return;
    }
    const closedId = lastAboutId.current;
    lastAboutId.current = null;
    if (!closedId) return;
    const openers = tabsRef.current?.querySelectorAll<HTMLElement>("[data-about-opener]") ?? [];
    Array.from(openers)
      .find((el) => el.dataset.aboutOpener === closedId)
      ?.focus();
  }, [openAboutId]);

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
      {aboutRx && <AboutMedicineView prescription={aboutRx} prescriptions={prescriptions} onBack={() => setAboutId(null)} />}
      {/* `contents` keeps the sticky tab bar tied to the window's scroller. */}
      <div ref={tabsRef} className={aboutRx ? "hidden" : "contents"}>
      <WardMedTabs activeTab={activeTab} onTabChange={setActiveTab} panelId={panelId} />

      <div role="tabpanel" id={panelId} aria-labelledby={wardMedTabId(panelId, activeTab)}>
        {activeTab === "schedule" && (
          // The "+" button floats over the bottom right corner: leave room under
          // the last row so it never covers a Take button.
          <div className="pb-[68px]">
            <WeekDaySelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            {/* A planned titration step waits for the user to confirm it. */}
            <TitrationStartPrompt className="mb-3" />
            <ScheduleView
              selectedDate={selectedDate}
              onDoseClick={handleDoseClick}
              onAddMed={handleAddMed}
            />
            <OtherDosesToday dateKey={selectedKey} isToday={isToday} />
          </div>
        )}

        {activeTab === "medications" && (
          <CompoundList onAddMed={handleAddMed} />
        )}

        {activeTab === "prescriptions" && (
          <PrescriptionsView onAddMed={handleAddMed} onOpenAbout={setAboutId} />
        )}

        {activeTab === "titrations" && <TitrationsView />}
      </div>
      </div>

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
