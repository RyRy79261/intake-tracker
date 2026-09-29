"use client";

import { useState } from "react";
import { PillIconWithBadge } from "@/components/medications/pill-icon";
import { Button } from "@intake/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDoseAmount, getCurrentTimeHHMM } from "@/lib/medication-ui-utils";
import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface DoseRowProps {
  slot: DoseSlot;
  isToday: boolean;
  isFuture: boolean;
  onTake: (slot: DoseSlot) => void;
  onRetroactiveTake: (slot: DoseSlot, time: string) => void;
  onSkip: (slot: DoseSlot) => void;
  onDoseClick: (slot: DoseSlot) => void;
  onEditTime: (slot: DoseSlot, time: string) => void;
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

export function DoseRow({ slot, isToday, isFuture, onTake, onRetroactiveTake, onSkip, onDoseClick, onEditTime }: DoseRowProps) {
  const { status, prescription, phase, inventory } = slot;
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [editPickerOpen, setEditPickerOpen] = useState(false);

  const isActionable = !isFuture && (status === "pending" || status === "missed");

  const doseLabel = formatDoseAmount(slot);

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
        data-status={status}
        className={cn(
          "grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line/60 p-2.5 first:border-t-0",
          status === "missed" && "shadow-[inset_3px_0_0_hsl(var(--sodium))]",
          !isActionable && "cursor-pointer hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
        onClick={!isActionable ? () => onDoseClick(slot) : undefined}
        role={!isActionable ? "button" : undefined}
        tabIndex={!isActionable ? 0 : undefined}
        onKeyDown={!isActionable ? (e) => {
          // Only the row itself: Enter on the inner Edit button stays with it.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDoseClick(slot);
          }
        } : undefined}
      >
        <PillIconWithBadge
          shape={inventory?.pillShape || "round"}
          color={inventory?.pillColor || "#ccc"}
          size={34}
          status={status === "missed" ? "pending" : status}
        />

        <div className="min-w-0">
          <p className={cn(
            "text-[0.9375rem] font-semibold leading-snug",
            status === "skipped" && "text-muted-foreground line-through"
          )}>
            {prescription.genericName}
          </p>
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">
            {doseLabel}
            {foodInstruction && ` -- ${foodInstruction} eating`}
          </p>

          {status === "taken" && (
            <p className="mt-0.5 flex items-center gap-1 text-[0.8125rem] font-semibold text-meds">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Taken at {takenAtDisplay}
            </p>
          )}

          {status === "skipped" && (
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
              {slot.existingLog?.skipReason || "Skipped"}
            </p>
          )}

          {status === "missed" && (
            <p className="mt-0.5 text-[0.8125rem] font-medium text-sodium">Missed</p>
          )}
        </div>

        {isActionable ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-2.5 text-[0.8125rem]"
              onClick={(e) => {
                e.stopPropagation();
                onSkip(slot);
              }}
            >
              Skip
            </Button>
            <Button
              size="sm"
              className="h-9 px-3"
              onClick={(e) => {
                e.stopPropagation();
                handleTakeClick();
              }}
            >
              Take
            </Button>
          </div>
        ) : status === "taken" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0 px-2.5 text-[0.8125rem]"
            onClick={(e) => {
              e.stopPropagation();
              setEditPickerOpen(true);
            }}
          >
            Edit
          </Button>
        ) : (
          <span />
        )}
      </div>

      {/* A late dose today defaults to now; a past-date back-fill defaults
          to the scheduled time, matching Mark All and the detail drawer. */}
      <RetroactiveTimePicker
        open={timePickerOpen}
        onOpenChange={setTimePickerOpen}
        defaultTime={isToday ? getCurrentTimeHHMM() : slot.localTime}
        compoundName={prescription.genericName}
        onConfirm={handleRetroactiveConfirm}
        notAfterNow={isToday}
      />

      <RetroactiveTimePicker
        open={editPickerOpen}
        onOpenChange={setEditPickerOpen}
        defaultTime={takenAtDisplay}
        compoundName={prescription.genericName}
        onConfirm={(time) => onEditTime(slot, time)}
        notAfterNow={isToday}
      />
    </>
  );
}
