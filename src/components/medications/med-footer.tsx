"use client";

import { CalendarDays, Pill, ClipboardList, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type MedTab = "schedule" | "prescriptions" | "medications" | "titrations" | "settings";

const TABS: { id: MedTab; icon: LucideIcon; label: string }[] = [
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "prescriptions", icon: ClipboardList, label: "Rx" },
  { id: "medications", icon: Pill, label: "Meds" },
  { id: "titrations", icon: TrendingUp, label: "Titrations" },
  { id: "settings", icon: Settings, label: "Settings" },
];

interface MedTabBarProps {
  activeTab: MedTab;
  onTabChange: (tab: MedTab) => void;
}

export function MedTabBar({ activeTab, onTabChange }: MedTabBarProps) {
  return (
    <div className="flex flex-wrap items-stretch border-b bg-background/95 backdrop-blur-sm -mx-4 mb-3">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2.5 px-3 text-sm font-medium min-w-fit transition-colors relative",
              "hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600 dark:bg-teal-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}
