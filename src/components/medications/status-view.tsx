"use client";

import { useMemo } from "react";
import { useDoseLogsWithDetailsForDate, useAllActiveInventoryItems } from "@/hooks/use-medication-queries";
import { PillIcon } from "./pill-icon";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DoseLogWithDetails } from "@/hooks/use-medication-queries";
import type { InventoryItem } from "@/lib/db";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StatusView() {
  const dateStr = useMemo(() => todayStr(), []);
  const logsWithDetails = useDoseLogsWithDetailsForDate(dateStr);
  const inventoryItems = useAllActiveInventoryItems();

  const stats = useMemo(() => {
    // Only count active (not rescheduled) logs for the total expected
    const activeLogs = logsWithDetails.filter(d => d.log.status !== "rescheduled");
    const taken = activeLogs.filter(d => d.log.status === "taken").length;
    const skipped = activeLogs.filter(d => d.log.status === "skipped").length;
    const total = activeLogs.length;
    
    // Total rescheduled logs overall
    const rescheduled = logsWithDetails.filter((d) => d.log.status === "rescheduled").length;
    
    const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { taken, skipped, rescheduled, total, pct };
  }, [logsWithDetails]);

  // Refill alerts based on inventoryItems
  const lowStockMeds = useMemo(() => {
    return inventoryItems.filter(item => {
      // Find matching phase logic could go here, but for simplicity we just check alert bounds
      const stock = item.currentStock ?? 0;
      if (item.refillAlertPills && stock <= item.refillAlertPills) return true;
      if (item.refillAlertDays && stock <= (item.refillAlertDays * 2)) return true; // simplified estimate
      return false;
    });
  }, [inventoryItems]);

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Today&apos;s Adherence</h3>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl font-bold text-teal-600 dark:text-teal-400">
              {stats.pct}%
            </span>
            <span className="text-sm text-muted-foreground">
              {stats.taken}/{stats.total} doses taken
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {stats.taken} taken
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-gray-400" />
              {stats.skipped} skipped
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              {stats.rescheduled} rescheduled
            </span>
          </div>
        </div>
      </div>

      {lowStockMeds.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Refill Alerts
          </h3>
          <div className="space-y-2">
            {lowStockMeds.map((med) => (
              <RefillAlertCard key={med.id} item={med} />
            ))}
          </div>
        </div>
      )}

      {logsWithDetails.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Activity</h3>
          <div className="space-y-1">
            {logsWithDetails
              .filter((d) => d.log.actionTimestamp)
              .sort((a, b) => (b.log.actionTimestamp ?? 0) - (a.log.actionTimestamp ?? 0))
              .slice(0, 10)
              .map((d: DoseLogWithDetails) => {
                const log = d.log;
                const time = log.actionTimestamp
                  ? new Date(log.actionTimestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : "";
                return (
                  <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm">
                    <PillIcon shape={d.inventory?.pillShape || "round"} color={d.inventory?.pillColor || "#ccc"} size={20} />
                    <span className="flex-1 truncate">
                      {d.inventory?.brandName || d.prescription.genericName}
                    </span>
                    <span className={cn(
                      "text-xs font-medium",
                      log.status === "taken" && "text-emerald-600 dark:text-emerald-400",
                      log.status === "skipped" && "text-gray-500",
                      log.status === "rescheduled" && "text-amber-600 dark:text-amber-400"
                    )}>
                      {log.status === "taken" ? "Taken" : log.status === "skipped" ? "Skipped" : "Rescheduled"} {time}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function RefillAlertCard({ item }: { item: InventoryItem }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <PillIcon shape={item.pillShape} color={item.pillColor} size={28} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {item.brandName} {item.strength}{item.unit}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {item.currentStock} pills left
        </p>
      </div>
    </div>
  );
}
