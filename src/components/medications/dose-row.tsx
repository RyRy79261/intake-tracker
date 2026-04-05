"use client";

import { useState } from "react";
import { PillIconWithBadge } from "./pill-icon";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPillCount } from "@/lib/medication-ui-utils";
import { RetroactiveTimePicker } from "./retroactive-time-picker";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface DoseRowProps {
  slot: DoseSlot;
  isToday: boolean;
  isFuture: boolean;
  onTake: (slot: DoseSlot) => void;
  onRetroactiveTake: (slot: DoseSlot, time: string) => void;
  onSkip: (slot: DoseSlot) => void;
  onDoseClick: (slot: DoseSlot) => void;
}

const LATE_THRESHOLD_MINUTES = 30;

function isLateDose(scheduledTime: string): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const parts = scheduledTime.split(":").map(Number);
  const schedMinutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return nowMinutes - schedMinutes > LATE_THRESHOLD_MINUTES;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DoseRow({ slot, isToday, isFuture, onTake, onRetroactiveTake, onSkip, onDoseClick }: DoseRowProps) {
  const { status, prescription, phase, inventory, pillsPerDose } = slot;
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const isActionable = !isFuture && (status === "pending" || status === "missed");

  const doseLabel = pillsPerDose != null
    ? `${formatPillCount(pillsPerDose)} of ${slot.dosageMg}${slot.unit}`
    : `${slot.dosageMg}${slot.unit}`;

  const foodInstruction = phase.foodInstruction !== "none" ? phase.foodInstruction : null;

  const handleTakeClick = () => {
    if (isToday && !isLateDose(slot.localTime)) {
      // Within notification window — log immediately at current time
      onTake(slot);
    } else {
      // Past date or late today — ask what time they took it
      setTimePickerOpen(true);
    }
  };

  const handleRetroactiveConfirm = (time: string) => {
    onRetroactiveTake(slot, time);
  };

  // Display the time the dose was actually taken
  const takenAtDisplay = slot.existingLog?.actionTimestamp
    ? formatTimestamp(slot.existingLog.actionTimestamp)
    : slot.localTime;

  return (
    <>
      <div
        className={cn(
          "rounded-xl border p-3 transition-all",
          status === "taken" && "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
          status === "skipped" && "bg-gray-50/50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-800 opacity-70",
          status === "missed" && "bg-amber-50/30 border-amber-200 dark:bg-amber-950/10 dark:border-amber-800",
          status === "pending" && "bg-card border-border",
          !isActionable && "cursor-pointer hover:bg-muted/50",
        )}
        onClick={!isActionable ? () => onDoseClick(slot) : undefined}
        role={!isActionable ? "button" : undefined}
        tabIndex={!isActionable ? 0 : undefined}
      >
        <div className="flex items-center gap-3">
          <PillIconWithBadge
            shape={inventory?.pillShape || "round"}
            color={inventory?.pillColor || "#ccc"}
            size={36}
            status={status === "missed" ? "pending" : status}
          />

          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-semibold text-sm leading-tight",
              status === "skipped" && "line-through"
            )}>
              {prescription.genericName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doseLabel}
              {foodInstruction && ` -- ${foodInstruction} eating`}
            </p>

            {status === "taken" && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Taken at {takenAtDisplay}
              </p>
            )}

            {status === "skipped" && (
              <p className="text-xs text-muted-foreground mt-1">
                {slot.existingLog?.skipReason || "Skipped"}
              </p>
            )}
          </div>

          {isActionable && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip(slot);
                }}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTakeClick();
                }}
              >
                Take
              </Button>
            </div>
          )}
        </div>
      </div>

      <RetroactiveTimePicker
        open={timePickerOpen}
        onOpenChange={setTimePickerOpen}
        defaultTime={slot.localTime}
        compoundName={prescription.genericName}
        onConfirm={handleRetroactiveConfirm}
      />
    </>
  );
}
