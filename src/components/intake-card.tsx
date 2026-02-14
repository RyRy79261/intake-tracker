"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { LIQUID_TYPE_OPTIONS } from "@/lib/constants";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { ManualInputDialog } from "./manual-input-dialog";
import { CoffeeDialog } from "./coffee-dialog";
import { useToast } from "@/hooks/use-toast";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useDeleteIntake, useRecentIntakeRecords, useUpdateIntake } from "@/hooks/use-intake-queries";
import { type IntakeRecord } from "@/lib/db";

interface IntakeCardProps {
  type: "water" | "salt";
  dailyTotal: number;    // Primary - since day start (for budget tracking)
  rollingTotal: number;  // Secondary - rolling 24h (for safety/pacing)
  limit: number;
  increment: number;
  onConfirm: (amount: number, timestamp?: number, note?: string) => Promise<void>;
  onConfirmWithSource?: (amount: number, source: string, timestamp?: number, note?: string) => Promise<void>;
  isLoading?: boolean;
}

export function IntakeCard({
  type,
  dailyTotal,
  rollingTotal,
  limit,
  increment,
  onConfirm,
  onConfirmWithSource,
  isLoading = false,
}: IntakeCardProps) {
  const [pendingAmount, setPendingAmount] = useState(increment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [showCoffeeDialog, setShowCoffeeDialog] = useState(false);
  const [liquidType, setLiquidType] = useState<"water" | "juice" | "coffee" | "food">("water");
  const { toast } = useToast();
  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, `${CARD_THEMES[type].label} entry removed`);

  // Extra edit field (amount is record-specific)
  const [editAmount, setEditAmount] = useState("");

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<IntakeRecord>({
    onOpen: (record) => setEditAmount(record.amount.toString()),
    buildUpdates: (timestamp, note) => {
      const newAmount = parseInt(editAmount, 10);
      if (isNaN(newAmount) || newAmount <= 0) {
        toast({ title: "Invalid amount", variant: "destructive" });
        return null;
      }
      return { amount: newAmount, timestamp, note };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  // Fetch recent records using TanStack Query
  const { data: recentRecords } = useRecentIntakeRecords(type);

  const theme = CARD_THEMES[type];
  const Icon = theme.icon;
  const unit = type === "water" ? "ml" : "mg";

  // Use daily total for budget tracking (primary metric)
  const progressPercent = limit > 0 ? Math.min((dailyTotal / limit) * 100, 100) : 0;
  const isOverLimit = limit > 0 && dailyTotal > limit;
  const wouldExceedLimit = limit > 0 && dailyTotal + pendingAmount > limit;

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + increment);
  }, [increment]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(increment, prev - increment));
  }, [increment]);

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || isSubmitting) return;

    // Coffee has its own dialog for type selection
    if (type === "water" && liquidType === "coffee") {
      setShowCoffeeDialog(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // Juice and food use onConfirmWithSource to tag the source
      if (type === "water" && liquidType !== "water" && onConfirmWithSource) {
        await onConfirmWithSource(pendingAmount, liquidType);
      } else {
        await onConfirm(pendingAmount);
      }
      const typeLabel = liquidType === "water" ? theme.label : liquidType.charAt(0).toUpperCase() + liquidType.slice(1);
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: `${typeLabel} intake recorded`,
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
  }, [pendingAmount, increment, onConfirm, onConfirmWithSource, toast, unit, theme.label, type, liquidType]);

  const handleCoffeeConfirm = useCallback(
    async (amount: number, source: string, timestamp?: number, note?: string) => {
      if (!onConfirmWithSource) return;
      setIsSubmitting(true);
      try {
        await onConfirmWithSource(amount, source, timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, "ml")}`,
          description: `Coffee intake recorded`,
          variant: "success",
        });
        setPendingAmount(increment);
        setShowCoffeeDialog(false);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to record coffee intake",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onConfirmWithSource, toast, increment]
  );

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        // Juice and food use onConfirmWithSource to tag the source
        if (type === "water" && liquidType !== "water" && onConfirmWithSource) {
          await onConfirmWithSource(amount, liquidType, timestamp, note);
        } else {
          await onConfirm(amount, timestamp, note);
        }
        const typeLabel = liquidType === "water" ? theme.label : liquidType.charAt(0).toUpperCase() + liquidType.slice(1);
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: timestamp
            ? `${typeLabel} intake recorded for earlier time`
            : `${typeLabel} intake recorded`,
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
    [onConfirm, onConfirmWithSource, toast, unit, theme.label, type, liquidType]
  );

  // Format time from timestamp
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          `bg-gradient-to-br ${theme.gradient} ${theme.border}`
        )}
      >
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", theme.iconBg)}>
                <Icon className={cn("w-5 h-5", theme.iconColor)} />
              </div>
              <span className="font-semibold text-lg uppercase tracking-wide">
                {theme.label}
              </span>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-medium",
                  isOverLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
                )}
              >
                {formatAmount(dailyTotal, unit)} / {formatAmount(limit, unit)}
              </p>
              <p className="text-xs text-muted-foreground">today</p>
              <p className="text-xs text-muted-foreground/70">
                24h: {formatAmount(rollingTotal, unit)}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <Progress
              value={progressPercent}
              className="h-3"
              indicatorClassName={cn(
                isOverLimit ? "bg-red-500" : theme.progressGradient
              )}
            />
          </div>

          {/* Liquid Type Selector (water card only) */}
          {type === "water" && (
            <div className="flex gap-1 mb-4 p-1 rounded-lg bg-muted/50">
              {LIQUID_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLiquidType(opt.value)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                    liquidType === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Input Controls */}
          <div className="flex items-center justify-between gap-3">
            {/* Decrement Button */}
            <Button
              variant="outline"
              size="icon-lg"
              onClick={handleDecrement}
              disabled={pendingAmount <= increment || isSubmitting}
              className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
            >
              <Minus className="w-6 h-6" />
            </Button>

            {/* Center Value - Clickable for manual input (or coffee dialog) */}
            <button
              onClick={() =>
                type === "water" && liquidType === "coffee"
                  ? setShowCoffeeDialog(true)
                  : setShowManualInput(true)
              }
              disabled={isSubmitting}
              className={cn(
                "flex-1 py-4 px-6 rounded-xl transition-all",
                "flex flex-col items-center justify-center gap-1",
                "hover:scale-105 active:scale-95",
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
              className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          {/* Confirm Button */}
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading}
            className={cn("w-full mt-4 h-12 text-base font-semibold", theme.buttonBg)}
          >
            <Check className="w-5 h-5 mr-2" />
            {isSubmitting ? "Recording..." : "Confirm Entry"}
          </Button>

          {/* Recent Entries */}
          <RecentEntriesList
            records={recentRecords}
            deletingId={deletingId}
            onDelete={handleDelete}
            onEdit={openEdit}
            borderColor={theme.border}
            renderEntry={(record) => {
              const sourceLabel = type === "water" ? getLiquidTypeLabel(record.source) : null;
              return (
                <>
                  <span className="text-muted-foreground">{formatTime(record.timestamp)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatAmount(record.amount, unit)}
                    </span>
                    {sourceLabel && (
                      <span className="text-xs text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded">
                        {sourceLabel}
                      </span>
                    )}
                  </div>
                </>
              );
            }}
          />
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

      <EditIntakeDialog
        record={editingRecord}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        amount={editAmount}
        onAmountChange={setEditAmount}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
      />

      {type === "water" && onConfirmWithSource && (
        <CoffeeDialog
          open={showCoffeeDialog}
          onOpenChange={setShowCoffeeDialog}
          onConfirm={handleCoffeeConfirm}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
