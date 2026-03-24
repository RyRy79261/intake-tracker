"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
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

const theme = CARD_THEMES.salt;
const Icon = theme.icon;

export function SaltSection() {
  const settings = useSettings();
  const saltIntake = useIntake("salt");
  const recentRecords = useRecentIntakeRecords("salt");
  const { toast } = useToast();

  const [pendingAmount, setPendingAmount] = useState(settings.saltIncrement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Salt entry removed"
  );

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

  const { dailyTotal, rollingTotal } = saltIntake;
  const limit = settings.saltLimit;
  const increment = settings.saltIncrement;

  const progressPercent =
    limit > 0 ? Math.min((dailyTotal / limit) * 100, 100) : 0;
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

    setIsSubmitting(true);
    try {
      await saltIntake.addRecord(pendingAmount, "manual");
      toast({
        title: `Added ${formatAmount(pendingAmount, "mg")}`,
        description: "Salt intake recorded",
        variant: "success",
      });
      setPendingAmount(increment);
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAmount, isSubmitting, saltIntake, toast, increment]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        await saltIntake.addRecord(amount, "manual", timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, "mg")}`,
          description: timestamp
            ? "Salt intake recorded for earlier time"
            : "Salt intake recorded",
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
    [saltIntake, toast]
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
      {/* Salt sub-header: icon only (no text label) + daily total / limit */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg", theme.iconBg)}>
            <Icon className={cn("w-5 h-5", theme.iconColor)} />
          </div>
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
            {formatAmount(dailyTotal, "mg")} / {formatAmount(limit, "mg")}
          </p>
          <p className="text-xs text-muted-foreground">today</p>
          <p className="text-xs text-muted-foreground/70">
            24h: {formatAmount(rollingTotal, "mg")}
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

      {/* +/- Controls */}
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
            +{formatAmount(pendingAmount, "mg")}
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

      {/* Confirm Entry Button */}
      <Button
        onClick={handleConfirm}
        disabled={isSubmitting || saltIntake.isLoading || pendingAmount <= 0}
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
        renderEntry={(record) => (
          <>
            <span className="text-muted-foreground">
              {formatTime(record.timestamp)}
            </span>
            <span className="font-medium">
              {formatAmount(record.amount, "mg")}
            </span>
          </>
        )}
      />

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type="salt"
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
