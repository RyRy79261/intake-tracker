"use client";

import { useDueDoseCount } from "@/components/shell/sys-bar";
import { useDueTitrationPlans } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import { cn } from "@/lib/utils";
import type { MedTab } from "@/components/medications/med-footer";

/** The Medications window's tabs. Settings lives in global Settings (PR 12). */
export type WardMedTab = Exclude<MedTab, "settings">;

const TABS: { id: WardMedTab; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "prescriptions", label: "Rx" },
  { id: "medications", label: "Meds" },
  { id: "titrations", label: "Titrations" },
];

interface WardMedTabsProps {
  activeTab: WardMedTab;
  onTabChange: (tab: WardMedTab) => void;
}

/**
 * Ward Console tab bar for the Medications window: four equal tabs, sticky
 * under the title bar, the active one underlined in ink. Schedule carries a
 * pip with today's open doses; Titrations one with the plans ready to start.
 */
export function WardMedTabs({ activeTab, onTabChange }: WardMedTabsProps) {
  const due = useDueDoseCount();
  const todayKey = useTodayKey();
  const ready = useDueTitrationPlans(todayKey).length;
  const pips: Partial<Record<WardMedTab, number>> = { schedule: due, titrations: ready };

  return (
    <div
      role="tablist"
      aria-label="Medications"
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
            aria-selected={on}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap px-1 text-sm font-medium",
              "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring",
              on ? "text-foreground shadow-[inset_0_-3px_0_hsl(var(--fg))]" : "text-muted-foreground hover:text-foreground",
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
