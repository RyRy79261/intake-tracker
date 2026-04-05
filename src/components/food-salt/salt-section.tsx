"use client";

import { useState, useCallback, useMemo } from "react";
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
import { useSettingsStore } from "@/stores/settings-store";
import { type IntakeRecord } from "@/lib/db";

const theme = CARD_THEMES.salt;
const Icon = theme.icon;

export function SaltSection() {
  const settings = useSettings();
  const sodiumPresets = useSettingsStore((s) => s.sodiumPresets);
  const saltIntake = useIntake("salt");
  const recentRecords = useRecentIntakeRecords("salt");
  const { toast } = useToast();

  const [selectedPresetId, setSelectedPresetId] = useState(
    () => sodiumPresets[0]?.id ?? ""
  );
  const [pendingAmount, setPendingAmount] = useState(settings.saltIncrement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const selectedPreset = useMemo(
    () => sodiumPresets.find((p) => p.id === selectedPresetId) ?? sodiumPresets[0],
    [sodiumPresets, selectedPresetId]
  );

  const sodiumPercent = selectedPreset?.sodiumPercent ?? 100;
  const sodiumAmount = Math.round(pendingAmount * sodiumPercent / 100);

  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Sodium entry removed"
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

  const { dailyTotal, rollingTotal } = saltIntake;
  const limit = settings.saltLimit;
  const increment = settings.saltIncrement;

  const progressPercent =
    limit > 0 ? Math.min((dailyTotal / limit) * 100, 100) : 0;
  const isOverLimit = limit > 0 && dailyTotal > limit;
  const wouldExceedLimit = limit > 0 && dailyTotal + sodiumAmount > limit;

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + increment);
  }, [increment]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(increment, prev - increment));
  }, [increment]);

  const handleConfirm = useCallback(async () => {
    if (sodiumAmount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const sourceName = selectedPreset?.name ?? "manual";
      await saltIntake.addRecord(sodiumAmount, `manual:${sourceName}`);
      toast({
        title: `Added ${formatAmount(sodiumAmount, "mg")} sodium`,
        description: sodiumPercent < 100
          ? `From ${formatAmount(pendingAmount, "mg")} ${selectedPreset?.name}`
          : "Sodium intake recorded",
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
  }, [sodiumAmount, isSubmitting, saltIntake, toast, increment, pendingAmount, sodiumPercent, selectedPreset]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        // Manual input enters sodium directly (no conversion)
        await saltIntake.addRecord(amount, "manual", timestamp, note);
        toast({
          title: `Added ${formatAmount(amount, "mg")} sodium`,
          description: timestamp
            ? "Sodium intake recorded for earlier time"
            : "Sodium intake recorded",
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
      {/* Sodium sub-header */}
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
          <p className="text-xs text-muted-foreground">today (sodium)</p>
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

      {/* Sodium Source Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        {sodiumPresets.map((preset) => (
          <Button
            key={preset.id}
            variant="outline"
            size="sm"
            onClick={() => setSelectedPresetId(preset.id)}
            className={cn(
              "text-xs transition-all",
              selectedPresetId === preset.id
                ? theme.activeToggle
                : "opacity-70"
            )}
          >
            {preset.name}
            {preset.sodiumPercent < 100 && (
              <span className="ml-1 text-muted-foreground">
                {preset.sodiumPercent}%
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* +/- Controls */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="icon-lg"
          onClick={handleDecrement}
          disabled={pendingAmount <= increment || isSubmitting}
          className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
        >
          <Minus className="w-6 h-6" />
        </Button>

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
            +{formatAmount(pendingAmount, "mg")}
          </span>
          {sodiumPercent < 100 ? (
            <span className="text-xs text-muted-foreground">
              {selectedPreset?.name} → {formatAmount(sodiumAmount, "mg")} sodium
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">sodium · tap to edit</span>
          )}
        </button>

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
        disabled={isSubmitting || saltIntake.isLoading || sodiumAmount <= 0}
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
              {formatAmount(record.amount, "mg")} Na
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
