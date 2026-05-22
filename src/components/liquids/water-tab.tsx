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

/** Parse the optional sugar field into rounded grams (0 when empty/invalid). */
function parseSugarGrams(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

const theme = CARD_THEMES.water;
const unit = "ml";

export function WaterTab() {
  const settings = useSettings();
  const waterIncrement = settings.waterIncrement;
  const waterLimit = settings.waterLimit;

  const waterIntake = useIntake("water");

  const [pendingAmount, setPendingAmount] = useState(waterIncrement);
  const [sugarG, setSugarG] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const { toast } = useToast();
  const addEntry = useAddComposableEntry();

  const { dailyTotal } = waterIntake;

  const progressPercent =
    waterLimit > 0 ? Math.min((dailyTotal / waterLimit) * 100, 100) : 0;
  const isOverLimit = waterLimit > 0 && dailyTotal > waterLimit;
  const wouldExceedLimit =
    waterLimit > 0 && dailyTotal + pendingAmount > waterLimit;

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + waterIncrement);
  }, [waterIncrement]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(waterIncrement, prev - waterIncrement));
  }, [waterIncrement]);

  // Log water — when a sugar amount is present, water and sugar are written
  // together as one grouped composable entry; otherwise a plain water record.
  const logWater = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      const sugar = parseSugarGrams(sugarG);
      if (sugar > 0) {
        const intakes: ComposableEntryInput["intakes"] = [
          { type: "water", amount, source: "manual", ...(note ? { note } : {}) },
          { type: "sugar", amount: sugar, source: "manual:sugar" },
        ];
        await addEntry({ intakes, groupSource: "manual_water_entry" }, timestamp);
      } else {
        await waterIntake.addRecord(amount, "manual", timestamp, note);
      }
    },
    [sugarG, addEntry, waterIntake]
  );

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await logWater(pendingAmount);
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: "Water intake recorded",
        variant: "success",
      });
      setPendingAmount(waterIncrement);
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
  }, [pendingAmount, isSubmitting, logWater, toast, waterIncrement]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        await logWater(amount, timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: timestamp
            ? "Water intake recorded for earlier time"
            : "Water intake recorded",
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
    [logWater, toast]
  );

  return (
    <>
      {/* Progress Bar */}
      <div className="mb-4">
        <Progress
          value={progressPercent}
          className="h-3"
          indicatorClassName={cn(
            isOverLimit ? theme.progressOverLimit : theme.progressGradient
          )}
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
              "text-3xl font-bold tabular-nums",
              wouldExceedLimit && !isOverLimit
                ? "text-orange-600 dark:text-orange-400"
                : theme.inputText
            )}
          >
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
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Optional sugar content */}
      <div className="mt-4 space-y-1">
        <Label htmlFor="water-sugar" className="text-sm">
          Sugar (g){" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="water-sugar"
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
        disabled={isSubmitting || waterIntake.isLoading || pendingAmount <= 0}
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
        onSubmit={handleManualSubmit}
        isSubmitting={isSubmitting}
      />

    </>
  );
}
