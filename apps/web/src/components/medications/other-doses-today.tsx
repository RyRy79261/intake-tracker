"use client";

import { useMemo, useState } from "react";
import {
  useAllInventoryItems,
  useDoseLogsForDate,
  usePrescriptions,
  useUndoPrnDose,
} from "@/hooks/use-medication-queries";
import { formatPillCount } from "@/lib/medication-ui-utils";
import { toast } from "@intake/ui/use-toast";
import { cn } from "@/lib/utils";

function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface OtherDosesTodayProps {
  /** "YYYY-MM-DD" of the day on the schedule. */
  dateKey: string;
  isToday: boolean;
}

/**
 * Doses outside the schedule on the selected day: the extra doses logged with
 * the window's "+" button and as-needed doses from the Rx tab (both are
 * kind='prn' dose logs). Undo arms first ("Remove?"), then removes the log
 * and puts its pills back in stock.
 */
export function OtherDosesToday({ dateKey, isToday }: OtherDosesTodayProps) {
  const logs = useDoseLogsForDate(dateKey);
  const prescriptions = usePrescriptions();
  const inventory = useAllInventoryItems();
  const undo = useUndoPrnDose();
  const [armed, setArmed] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      logs
        .filter((l) => l.kind === "prn" && l.status === "taken")
        .sort((a, b) => (a.actionTimestamp ?? a.createdAt) - (b.actionTimestamp ?? b.createdAt)),
    [logs],
  );

  if (rows.length === 0) return null;

  const remove = (id: string, name: string) => {
    setArmed(null);
    undo.mutate(id, {
      onSuccess: () =>
        toast({ title: `${name} dose removed`, description: "Stock restored" }),
      onError: () => toast({ title: "Failed to remove dose", variant: "destructive" }),
    });
  };

  return (
    <section aria-labelledby="other-doses-heading" className="mt-4">
      <h3
        id="other-doses-heading"
        className="mb-1.5 flex items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground after:h-px after:flex-1 after:bg-line"
      >
        {isToday ? "Other doses today" : "Other doses"}
      </h3>
      <ul className="border border-line bg-background">
        {rows.map((log) => {
          const rx = prescriptions.find((p) => p.id === log.prescriptionId);
          const inv = log.inventoryItemId ? inventory.find((i) => i.id === log.inventoryItemId) : undefined;
          const name = rx?.genericName ?? "Medication";
          const unit = inv?.unit || "mg";
          const time = clock(log.actionTimestamp ?? log.createdAt);
          const pills =
            inv && log.doseMg != null && inv.strength > 0
              ? Math.round((log.doseMg / inv.strength) * 10000) / 10000
              : null;
          const sub =
            pills != null && inv
              ? `Extra dose · ${formatPillCount(pills)} of ${inv.brandName}`
              : "Extra dose · no stock deducted";
          const isArmed = armed === log.id;
          return (
            <li
              key={log.id}
              className="grid min-h-14 grid-cols-[3.4em_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line py-1.5 pl-2.5 pr-1.5 first:border-t-0"
            >
              <span className="font-mono text-[0.8125rem] text-muted-foreground">{time}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug">
                  {name}
                  {log.doseMg != null && (
                    <span className="font-mono text-[0.8125rem] font-normal text-muted-foreground">
                      {" "}
                      {log.doseMg} {unit}
                    </span>
                  )}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {sub}
                  {log.note ? ` · ${log.note}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={undo.isPending}
                onClick={() => (isArmed ? remove(log.id, name) : setArmed(log.id))}
                onBlur={() => isArmed && setArmed(null)}
                aria-label={`${isArmed ? "Confirm remove" : "Undo"} ${name} at ${time}`}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center border px-2.5 text-[0.8125rem] font-medium disabled:opacity-50",
                  isArmed ? "border-bp text-bp" : "border-input hover:bg-foreground/6",
                )}
              >
                {isArmed ? "Remove?" : "Undo"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
