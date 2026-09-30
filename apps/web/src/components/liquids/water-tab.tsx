"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@intake/ui/button";
import { SegmentBar } from "@/components/home/module-card";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@intake/ui/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";
import { computeTwoStageProgress } from "@intake/core/progress";
import { reportSaveError } from "@/lib/db-recovery";
import { formatDateTime } from "@/lib/date-utils";
import { useOnLogged } from "@/components/log-form-scope";

const unit = "ml";

export function WaterTab() {
  const onLogged = useOnLogged();
  const settings = useSettings();
  const waterIncrement = settings.waterIncrement;
  const waterLimit = settings.waterLimit;
  const waterExtendedBuffer = settings.waterExtendedBuffer;

  const waterIntake = useIntake("water");

  const [pendingAmount, setPendingAmount] = useState(waterIncrement);
  // Optional custom time / note picked in the "tap to edit" dialog. They ride
  // along with the next Confirm and are cleared after it.
  const [pendingTimestamp, setPendingTimestamp] = useState<number | undefined>();
  const [pendingNote, setPendingNote] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  // Synchronous in-flight guard: `isSubmitting` is read from the render
  // closure, so two clicks dispatched before React re-renders both pass it.
  const inFlightRef = useRef(false);

  const { toast } = useToast();

  const { dailyTotal } = waterIntake;

  const progress = computeTwoStageProgress(
    dailyTotal,
    waterLimit,
    waterExtendedBuffer
  );
  const isOverLimit = progress.isOverTarget;
  const wouldExceedLimit =
    waterLimit > 0 && dailyTotal + pendingAmount > waterLimit;

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + waterIncrement);
  }, [waterIncrement]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(waterIncrement, prev - waterIncrement));
  }, [waterIncrement]);

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      await waterIntake.addRecord(
        pendingAmount,
        "manual",
        pendingTimestamp,
        pendingNote
      );
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: pendingTimestamp
          ? "Water intake recorded for earlier time"
          : "Water intake recorded",
        variant: "success",
      });
      onLogged();
      setPendingAmount(waterIncrement);
      setPendingTimestamp(undefined);
      setPendingNote(undefined);
    } catch (e) {
      reportSaveError("water", e);
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [pendingAmount, pendingTimestamp, pendingNote, waterIntake, toast, waterIncrement, onLogged]);

  // "Tap to edit" only edits the pending entry; Confirm is the single commit.
  const handleManualSubmit = useCallback(
    (amount: number, timestamp?: number, note?: string) => {
      setPendingAmount(amount);
      setPendingTimestamp(timestamp);
      setPendingNote(note);
      setShowManualInput(false);
    },
    []
  );

  return (
    <div className="flex flex-col gap-2.5">
      <SegmentBar
        value={dailyTotal}
        limit={waterLimit}
        buffer={waterExtendedBuffer}
        aria-label="Water intake today, as a percentage of the daily limit"
      />

      {/* Quick-set size buttons */}
      <div className="wc-qchips">
        {[70, 100, 150, 200].map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={pendingAmount === size}
            onClick={() => setPendingAmount(size)}
          >
            {size}
          </button>
        ))}
      </div>

      {/* − amount + (tap the amount to type it, or set a time / note) */}
      <div className="wc-lstep">
        <button
          type="button"
          className="rb"
          onClick={handleDecrement}
          disabled={pendingAmount <= waterIncrement || isSubmitting}
          aria-label="Decrease water amount"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowManualInput(true)}
          disabled={isSubmitting}
          className={cn("amt", wouldExceedLimit && !isOverLimit && "warn")}
        >
          <b>+{formatAmount(pendingAmount, unit)}</b>
          <small>
            {pendingTimestamp !== undefined &&
              `${formatDateTime(pendingTimestamp)} · `}
            {pendingNote !== undefined && "with note · "}
            tap to edit
          </small>
        </button>
        <button
          type="button"
          className="rb"
          onClick={handleIncrement}
          disabled={isSubmitting}
          aria-label="Increase water amount"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <Button
        onClick={handleConfirm}
        disabled={isSubmitting || pendingAmount <= 0}
        className="w-full"
      >
        <Check className="w-5 h-5" />
        {isSubmitting ? "Recording..." : "Confirm Entry"}
      </Button>

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type="water"
        currentValue={pendingAmount}
        initialTimestamp={pendingTimestamp}
        initialNote={pendingNote}
        onSubmit={handleManualSubmit}
        description="Set the amount (and optionally the time or a note), then confirm the entry."
        submitLabel="Set Amount"
      />
    </div>
  );
}
