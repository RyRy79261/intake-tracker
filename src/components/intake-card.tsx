"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Check, Droplets, Sparkles } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { ManualInputDialog } from "./manual-input-dialog";
import { useToast } from "@/hooks/use-toast";

interface IntakeCardProps {
  type: "water" | "salt";
  currentTotal: number;
  limit: number;
  increment: number;
  onConfirm: (amount: number) => Promise<void>;
  isLoading?: boolean;
}

export function IntakeCard({
  type,
  currentTotal,
  limit,
  increment,
  onConfirm,
  isLoading = false,
}: IntakeCardProps) {
  const [pendingAmount, setPendingAmount] = useState(increment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const { toast } = useToast();

  const isWater = type === "water";
  const unit = isWater ? "ml" : "mg";
  const icon = isWater ? Droplets : Sparkles;
  const Icon = icon;

  const progressPercent = Math.min((currentTotal / limit) * 100, 100);
  const isOverLimit = currentTotal > limit;
  const wouldExceedLimit = currentTotal + pendingAmount > limit;

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + increment);
  }, [increment]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(increment, prev - increment));
  }, [increment]);

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onConfirm(pendingAmount);
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: `${isWater ? "Water" : "Salt"} intake recorded`,
        variant: "success",
      });
      setPendingAmount(increment);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAmount, increment, onConfirm, toast, unit, isWater]);

  const handleManualSubmit = useCallback(
    async (amount: number) => {
      setIsSubmitting(true);
      try {
        await onConfirm(amount);
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: `${isWater ? "Water" : "Salt"} intake recorded`,
          variant: "success",
        });
        setShowManualInput(false);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to record intake",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onConfirm, toast, unit, isWater]
  );

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          isWater
            ? "bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/40 dark:to-cyan-950/40 border-sky-200 dark:border-sky-800"
            : "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-amber-200 dark:border-amber-800"
        )}
      >
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isWater
                    ? "bg-sky-100 dark:bg-sky-900/50"
                    : "bg-amber-100 dark:bg-amber-900/50"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5",
                    isWater
                      ? "text-sky-600 dark:text-sky-400"
                      : "text-amber-600 dark:text-amber-400"
                  )}
                />
              </div>
              <span className="font-semibold text-lg uppercase tracking-wide">
                {isWater ? "Water" : "Salt"}
              </span>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-medium",
                  isOverLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                )}
              >
                {formatAmount(currentTotal, unit)} / {formatAmount(limit, unit)}
              </p>
              <p className="text-xs text-muted-foreground">rolling 24h</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <Progress
              value={progressPercent}
              className="h-3"
              indicatorClassName={cn(
                isOverLimit
                  ? "bg-red-500"
                  : isWater
                  ? "bg-gradient-to-r from-sky-400 to-cyan-500"
                  : "bg-gradient-to-r from-amber-400 to-orange-500"
              )}
            />
          </div>

          {/* Input Controls */}
          <div className="flex items-center justify-between gap-3">
            {/* Decrement Button */}
            <Button
              variant="outline"
              size="icon-lg"
              onClick={handleDecrement}
              disabled={pendingAmount <= increment || isSubmitting}
              className={cn(
                "shrink-0 rounded-full transition-all",
                isWater
                  ? "hover:bg-sky-100 hover:border-sky-300 dark:hover:bg-sky-900/50"
                  : "hover:bg-amber-100 hover:border-amber-300 dark:hover:bg-amber-900/50"
              )}
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
                "hover:scale-105 active:scale-95",
                isWater
                  ? "bg-sky-100/80 hover:bg-sky-200/80 dark:bg-sky-900/50 dark:hover:bg-sky-800/50"
                  : "bg-amber-100/80 hover:bg-amber-200/80 dark:bg-amber-900/50 dark:hover:bg-amber-800/50"
              )}
            >
              <span
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  wouldExceedLimit && !isOverLimit
                    ? "text-orange-600 dark:text-orange-400"
                    : isWater
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-amber-700 dark:text-amber-300"
                )}
              >
                +{formatAmount(pendingAmount, unit)}
              </span>
              <span className="text-xs text-muted-foreground">
                tap to edit
              </span>
            </button>

            {/* Increment Button */}
            <Button
              variant="outline"
              size="icon-lg"
              onClick={handleIncrement}
              disabled={isSubmitting}
              className={cn(
                "shrink-0 rounded-full transition-all",
                isWater
                  ? "hover:bg-sky-100 hover:border-sky-300 dark:hover:bg-sky-900/50"
                  : "hover:bg-amber-100 hover:border-amber-300 dark:hover:bg-amber-900/50"
              )}
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          {/* Confirm Button */}
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading}
            className={cn(
              "w-full mt-4 h-12 text-base font-semibold",
              isWater ? "bg-sky-600 hover:bg-sky-700" : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            <Check className="w-5 h-5 mr-2" />
            {isSubmitting ? "Recording..." : "Confirm Entry"}
          </Button>
        </CardContent>
      </Card>

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type={type}
        currentValue={pendingAmount}
        onSubmit={handleManualSubmit}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
