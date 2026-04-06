"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";

const theme = CARD_THEMES.water;
const unit = "ml";

export function BeverageTab() {
  const settings = useSettings();
  const waterIncrement = settings.waterIncrement;

  const waterLimit = settings.waterLimit;
  const waterIntake = useIntake("water");

  const { dailyTotal } = waterIntake;
  const progressPercent =
    waterLimit > 0 ? Math.min((dailyTotal / waterLimit) * 100, 100) : 0;
  const isOverLimit = waterLimit > 0 && dailyTotal > waterLimit;

  const [pendingAmount, setPendingAmount] = useState(waterIncrement);
  const [beverageName, setBeverageName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const { toast } = useToast();

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + waterIncrement);
  }, [waterIncrement]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(waterIncrement, prev - waterIncrement));
  }, [waterIncrement]);

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const source = beverageName.trim()
        ? `beverage:${beverageName.trim()}`
        : "beverage";
      await waterIntake.addRecord(pendingAmount, source);
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: "Beverage intake recorded",
        variant: "success",
      });
      setPendingAmount(waterIncrement);
      setBeverageName("");
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAmount, isSubmitting, beverageName, waterIntake, toast, waterIncrement]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        const source = beverageName.trim()
          ? `beverage:${beverageName.trim()}`
          : "beverage";
        await waterIntake.addRecord(amount, source, timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: timestamp
            ? "Beverage intake recorded for earlier time"
            : "Beverage intake recorded",
          variant: "success",
        });
        setShowManualInput(false);
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
    [beverageName, waterIntake, toast]
  );

  return (
    <>
      {/* Water Progress Bar */}
      <div className="mb-4">
        <Progress
          value={progressPercent}
          className="h-3"
          indicatorClassName={cn(
            isOverLimit ? theme.progressOverLimit : theme.progressGradient
          )}
        />
      </div>

      {/* Name Input */}
      <Input
        placeholder="e.g. Juice, Smoothie"
        value={beverageName}
        onChange={(e) => setBeverageName(e.target.value)}
        className="h-10 mb-3"
      />

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
