"use client";

import { motion } from "motion/react";
import { CalendarDays, ClipboardList, Pill, Settings, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type MedTab = "schedule" | "status" | "prescriptions" | "medications" | "settings";

const TABS: { id: MedTab; icon: LucideIcon; label: string }[] = [
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "status", icon: ClipboardList, label: "Status" },
  { id: "prescriptions", icon: FlaskConical, label: "Prescription" },
  { id: "medications", icon: Pill, label: "Supply" },
  { id: "settings", icon: Settings, label: "Settings" },
];

interface MedFooterProps {
  activeTab: MedTab;
  onTabChange: (tab: MedTab) => void;
  hidden: boolean;
  transitionDuration?: number;
}

export function MedFooter({ activeTab, onTabChange, hidden, transitionDuration = 0.2 }: MedFooterProps) {
  return (
    <motion.footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-gradient-to-t from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      animate={{ y: hidden ? "100%" : 0 }}
      transition={{ duration: transitionDuration, ease: "easeInOut" }}
    >
      <div className="flex items-center justify-around px-4 py-2">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors",
                "hover:bg-muted/80 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <tab.icon
                className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors",
                  isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.footer>
  );
}
