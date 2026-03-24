"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import {
  useIntake,
  useRecentIntakeRecords,
  useDeleteIntake,
  useUpdateIntake,
} from "@/hooks/use-intake-queries";
import { type IntakeRecord } from "@/lib/db";

const theme = CARD_THEMES.water;
const unit = "ml";

export function WaterTab() {
  const settings = useSettings();
  const waterIncrement = settings.waterIncrement;
  const waterLimit = settings.waterLimit;

  const waterIntake = useIntake("water");
  const { data: recentRecords } = useRecentIntakeRecords("water");

  const [pendingAmount, setPendingAmount] = useState(waterIncrement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const { toast } = useToast();
  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Water entry removed"
  );

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

  const { dailyTotal, rollingTotal } = waterIntake;

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

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await waterIntake.addRecord(pendingAmount, "manual");
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: "Water intake recorded",
        variant: "success",
      });
      setPendingAmount(waterIncrement);
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAmount, isSubmitting, waterIntake, toast, waterIncrement]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        await waterIntake.addRecord(amount, "manual", timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: timestamp
            ? "Water intake recorded for earlier time"
            : "Water intake recorded",
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
    [waterIntake, toast]
  );

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <>
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
        disabled={isSubmitting || waterIntake.isLoading || pendingAmount <= 0}
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
          const sourceLabel = getLiquidTypeLabel(record.source);
          return (
            <>
              <span className="text-muted-foreground">
                {formatTime(record.timestamp)}
              </span>
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

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type="water"
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
    </>
  );
}
