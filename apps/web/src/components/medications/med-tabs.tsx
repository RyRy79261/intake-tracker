"use client";

import type { KeyboardEvent } from "react";
import { useDueDoseCount } from "@/components/shell/sys-bar";
import { useDueTitrationPlans } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import { cn } from "@/lib/utils";
/** The Medications window's tabs. Medication settings live in the global Settings sheet. */
export type MedTab = "schedule" | "prescriptions" | "medications" | "titrations";

const TABS: { id: MedTab; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "prescriptions", label: "Rx" },
  { id: "medications", label: "Meds" },
  { id: "titrations", label: "Titrations" },
];

interface WardMedTabsProps {
  activeTab: MedTab;
  onTabChange: (tab: MedTab) => void;
  /** id of the tabpanel the tabs control; each tab's id is `${panelId}-${tab}`. */
  panelId: string;
}

/** The tab's element id, for the panel's aria-labelledby. */
export function wardMedTabId(panelId: string, tab: MedTab): string {
  return `${panelId}-${tab}`;
}

/**
 * Ward Console tab bar for the Medications window: four equal tabs, sticky
 * under the title bar, the active one underlined in ink. Schedule carries a
 * pip with today's open doses; Titrations one with the plans ready to start.
 */
export function WardMedTabs({ activeTab, onTabChange, panelId }: WardMedTabsProps) {
  const due = useDueDoseCount();
  const todayKey = useTodayKey();
  const ready = useDueTitrationPlans(todayKey).length;
  const pips: Partial<Record<MedTab, number>> = { schedule: due, titrations: ready };

  // WAI-ARIA tabs: one tab stop (the selected tab); arrows, Home and End
  // move between tabs and select them.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === activeTab);
    const last = TABS.length - 1;
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    const tab = TABS[next]!.id;
    onTabChange(tab);
    document.getElementById(wardMedTabId(panelId, tab))?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Medications"
      onKeyDown={onKeyDown}
      className="sticky top-0 z-[2] -mx-4 mb-3 flex border-b border-line bg-panel"
    >
      {TABS.map((tab) => {
        const on = tab.id === activeTab;
        const pip = pips[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={wardMedTabId(panelId, tab.id)}
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap px-1 text-sm font-medium",
              "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring",
              on ? "text-foreground shadow-[inset_0_-3px_0_hsl(var(--primary))]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {pip > 0 && (
              <span
                data-testid={`med-tab-pip-${tab.id}`}
                aria-label={tab.id === "schedule" ? `${pip} due` : `${pip} ready`}
                className="ml-[5px] inline-flex h-4 min-w-4 items-center justify-center bg-meds px-[3px] font-mono text-[0.625rem] font-semibold leading-none text-on-domain"
              >
                {pip}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
