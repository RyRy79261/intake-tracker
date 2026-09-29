"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@intake/ui/button";
import { Progress } from "@intake/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@intake/ui/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";
import { computeTwoStageProgress } from "@intake/core/progress";
import { reportSaveError } from "@/lib/db-recovery";
import { formatDateTime } from "@/lib/date-utils";
import { useOnLogged } from "@/components/log-form-scope";

const theme = CARD_THEMES.water;
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
    <>
      {/* Progress Bar */}
      <div className="mb-4">
        <Progress
          value={progress.isOverExtended ? 100 : progress.primaryPct}
          extendedValue={progress.isOverExtended ? 0 : progress.extendedPct}
          targetMarkerPct={progress.isOverExtended ? 0 : progress.targetPct}
          className="h-3"
          indicatorClassName={
            progress.isOverExtended ? theme.progressOverLimit : theme.progressGradient
          }
          extendedIndicatorClassName={theme.progressExtended}
          aria-label="Water intake today, as a percentage of the daily limit"
        />
      </div>

      {/* Quick-set size buttons */}
      <div className="flex gap-2 mb-3">
        {[70, 100, 150, 200].map((size) => (
          <Button
            key={size}
            variant="outline"
            size="sm"
            onClick={() => setPendingAmount(size)}
            className={cn(
              "flex-1",
              pendingAmount === size && theme.activeToggle
            )}
          >
            {size}
          </Button>
        ))}
      </div>

      {/* Input Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Decrement Button */}
        <Button
          variant="outline"
          size="icon-lg"
          onClick={handleDecrement}
          disabled={pendingAmount <= waterIncrement || isSubmitting}
          className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
          aria-label="Decrease water amount"
        >
          <Minus className="w-6 h-6" />
        </Button>

        {/* Center Value - Clickable for manual input */}
        <button
          onClick={() => setShowManualInput(true)}
          disabled={isSubmitting}
          className={cn(
            "flex-1 py-4 px-6 rounded-xl transition-all",
            "flex flex-col items-center justify-center gap-1",
            "active:scale-95",
            theme.inputBg
          )}
        >
          <span
            className={cn(
              "text-3xl font-bold num",
              wouldExceedLimit && !isOverLimit
                ? "text-orange-600 dark:text-orange-400"
                : theme.inputText
            )}
          >
            +{formatAmount(pendingAmount, unit)}
          </span>
          <span className="text-xs text-muted-foreground">
            {pendingTimestamp !== undefined &&
              `${formatDateTime(pendingTimestamp)} · `}
            {pendingNote !== undefined && "with note · "}
            tap to edit
          </span>
        </button>

        {/* Increment Button */}
        <Button
          variant="outline"
          size="icon-lg"
          onClick={handleIncrement}
          disabled={isSubmitting}
          className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
          aria-label="Increase water amount"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Confirm Button */}
      <Button
        onClick={handleConfirm}
        disabled={isSubmitting || pendingAmount <= 0}
        className={cn("w-full mt-4 h-12 text-base font-semibold", theme.buttonBg)}
      >
        <Check className="w-5 h-5 mr-2" />
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

    </>
  );
}
