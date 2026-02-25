"use client";

import { useMemo } from "react";
import { useDailySchedule, usePrescriptions, useDoseLogsForDate, useAllActiveInventoryItems } from "@/hooks/use-medication-queries";
import { PillIcon } from "./pill-icon";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Prescription } from "@/lib/db";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StatusView() {
  const dateStr = useMemo(() => todayStr(), []);
  const { data: prescriptions = [], isLoading: medsLoading } = usePrescriptions();
  const { data: doseLogs = [], isLoading: logsLoading } = useDoseLogsForDate(dateStr);
  const { data: inventoryItems = [], isLoading: invLoading } = useAllActiveInventoryItems();

  const { data: scheduleMap, isLoading: schedLoading } = useDailySchedule(new Date().getDay());

  const isLoading = medsLoading || logsLoading || invLoading || schedLoading;

  const stats = useMemo(() => {
    const taken = doseLogs.filter((l) => l.status === "taken").length;
    const skipped = doseLogs.filter((l) => l.status === "skipped").length;
    const rescheduled = doseLogs.filter((l) => l.status === "rescheduled").length;
    
    // Calculate expected total from base schedule
    let baseExpectedTotal = 0;
    if (scheduleMap) {
      for (const entries of Array.from(scheduleMap.values())) {
        baseExpectedTotal += entries.length;
      }
    }
    
    // Fallback to doseLogs length if it's somehow higher (shouldn't happen but safe)
    const total = Math.max(baseExpectedTotal, doseLogs.length);
    const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { taken, skipped, rescheduled, total, pct };
  }, [doseLogs, scheduleMap]);

  // TODO: Update lowStockMeds to use inventory
  const lowStockMeds: any[] = [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              <RefillAlertCard key={med.id} medication={med} />
            ))}
          </div>
        </div>
      )}

      {doseLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Activity</h3>
          <div className="space-y-1">
            {doseLogs
              .filter((l) => l.actionTimestamp)
              .sort((a, b) => (b.actionTimestamp ?? 0) - (a.actionTimestamp ?? 0))
              .slice(0, 10)
              .map((log) => {
                const med = prescriptions.find((m) => m.id === log.prescriptionId);
                if (!med) return null;
                const time = log.actionTimestamp
                  ? new Date(log.actionTimestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : "";
                return (
                  <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm">
                    <PillIcon shape="round" color="#ccc" size={20} />
                    <span className="flex-1 truncate">
                      {med.genericName}
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

function RefillAlertCard({ medication: med }: { medication: any }) {
  const dailyUsage = med.dosageAmount;
  const daysLeft = dailyUsage > 0 ? Math.floor(med.currentStock / dailyUsage) : 0;

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <PillIcon shape={med.pillShape} color={med.pillColor} size={28} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {med.brandName} {med.dosageStrength}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {med.currentStock} pills left (~{daysLeft} days)
        </p>
      </div>
    </div>
  );
}
