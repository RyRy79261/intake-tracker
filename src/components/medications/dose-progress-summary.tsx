"use client";

import { CheckCircle2 } from "lucide-react";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import { computeProgress } from "@/lib/medication-ui-utils";

interface DoseProgressSummaryProps {
  slots: DoseSlot[];
  lowStockWarnings: string[];
}

export function DoseProgressSummary({ slots, lowStockWarnings }: DoseProgressSummaryProps) {
  const { total, taken, pct, allDone } = computeProgress(slots);

  if (allDone && total > 0) {
    return (
      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">
            All done for today!
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {taken}/{total} doses taken
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {taken}/{total} taken
        </span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-teal-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {lowStockWarnings.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Low stock: {lowStockWarnings.join(", ")}
        </p>
      )}
    </div>
  );
}
