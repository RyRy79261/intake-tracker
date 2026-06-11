"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";
import {
  useAddComposableEntry,
  type ComposableEntryInput,
} from "@/hooks/use-composable-entry";
import { computeTwoStageProgress } from "@/lib/progress-utils";

/** Parse the optional sugar field into rounded grams (0 when empty/invalid). */
function parseSugarGrams(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

const theme = CARD_THEMES.water;
const unit = "ml";

export function BeverageTab() {
  const settings = useSettings();
  const waterIncrement = settings.waterIncrement;

  const waterLimit = settings.waterLimit;
  const waterExtendedBuffer = settings.waterExtendedBuffer;
  const waterIntake = useIntake("water");

  const { dailyTotal } = waterIntake;
  const progress = computeTwoStageProgress(
    dailyTotal,
    waterLimit,
    waterExtendedBuffer
  );

  const [pendingAmount, setPendingAmount] = useState(waterIncrement);
  const [beverageName, setBeverageName] = useState("");
  const [sugarG, setSugarG] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const { toast } = useToast();
  const addEntry = useAddComposableEntry();

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + waterIncrement);
  }, [waterIncrement]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(waterIncrement, prev - waterIncrement));
  }, [waterIncrement]);

  // Log the beverage — when a sugar amount is present, the drink volume and
  // sugar are written together as one grouped composable entry; otherwise a
  // plain water record.
  const logBeverage = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      const source = beverageName.trim()
        ? `beverage:${beverageName.trim()}`
        : "beverage";
      const sugar = parseSugarGrams(sugarG);
      if (sugar > 0) {
        const intakes: ComposableEntryInput["intakes"] = [
          { type: "water", amount, source, ...(note ? { note } : {}) },
          { type: "sugar", amount: sugar, source: "manual:sugar" },
        ];
        await addEntry(
          { intakes, groupSource: "manual_beverage_entry" },
          timestamp
        );
      } else {
        await waterIntake.addRecord(amount, source, timestamp, note);
      }
    },
    [beverageName, sugarG, addEntry, waterIntake]
  );

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await logBeverage(pendingAmount);
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: "Beverage intake recorded",
        variant: "success",
      });
      setPendingAmount(waterIncrement);
      setBeverageName("");
      setSugarG("");
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAmount, isSubmitting, logBeverage, toast, waterIncrement]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        await logBeverage(amount, timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: timestamp
            ? "Beverage intake recorded for earlier time"
            : "Beverage intake recorded",
          variant: "success",
        });
        setShowManualInput(false);
        setSugarG("");
      } catch {
        toast({
          title: "Error",
          description: "Failed to record intake",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [logBeverage, toast]
  );

  return (
    <>
      {/* Water Progress Bar */}
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

      {/* Name Input */}
      <Input
        placeholder="e.g. Juice, Smoothie"
        value={beverageName}
        onChange={(e) => setBeverageName(e.target.value)}
        className="h-10 mb-3"
      />

      {/* Quick-set size buttons */}
      <div className="flex gap-2 mb-3">
        {[40, 200, 330, 500].map((size) => (
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
          aria-label="Decrease beverage amount"
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
          <span className={cn("text-3xl font-bold tabular-nums", theme.inputText)}>
            +{formatAmount(pendingAmount, unit)}
          </span>
          <span className="text-xs text-muted-foreground">tap to edit</span>
        </button>

        {/* Increment Button */}
        <Button
          variant="outline"
          size="icon-lg"
          onClick={handleIncrement}
          disabled={isSubmitting}
          className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
          aria-label="Increase beverage amount"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Optional sugar content */}
      <div className="mt-4 space-y-1">
        <Label htmlFor="beverage-sugar" className="text-sm">
          Sugar (g){" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="beverage-sugar"
          type="number"
          min="0"
          inputMode="decimal"
          placeholder="g"
          value={sugarG}
          onChange={(e) => setSugarG(e.target.value)}
        />
      </div>

      {/* Confirm Button */}
      <Button
        onClick={handleConfirm}
        disabled={isSubmitting || pendingAmount <= 0}
        className={cn("w-full mt-4 h-12 text-base font-semibold", theme.buttonBg)}
      >
        <Check className="w-5 h-5 mr-2" />
        {isSubmitting ? "Logging..." : "Log Beverage"}
      </Button>

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type="water"
        currentValue={pendingAmount}
        onSubmit={handleManualSubmit}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
