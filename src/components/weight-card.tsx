"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Check, Loader2 } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { logAudit } from "@/lib/audit";

const WeightFormSchema = z.object({
  weight: z.number({ invalid_type_error: "Weight is required" })
    .positive("Weight must be positive")
    .max(1000, "Weight seems too high"),
});
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { type WeightRecord } from "@/lib/db";
import { useWeightRecords, useAddWeight, useDeleteWeight, useUpdateWeight } from "@/hooks/use-health-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

const theme = CARD_THEMES.weight;
const Icon = theme.icon;

export function WeightCard() {
  const { toast } = useToast();
  const settings = useSettings();
  const [pendingWeight, setPendingWeight] = useState<number | null>(null);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const recentRecords = useWeightRecords(5);
  const isLoading = !recentRecords || recentRecords.length === 0 && pendingWeight === null;
  const addMutation = useAddWeight();
  const deleteMutation = useDeleteWeight();
  const updateMutation = useUpdateWeight();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Weight record removed");

  // Pre-fill with latest weight when records load.
  // useLiveQuery defaults to [] before Dexie resolves, so we delay the
  // fallback to avoid setting 70 before real records arrive.
  useEffect(() => {
    if (pendingWeight !== null) return;
    if (recentRecords && recentRecords.length > 0) {
      const latest = recentRecords[0];
      if (latest) setPendingWeight(latest.weight);
      return;
    }
    // Delay fallback so live query has time to resolve with real data
    const timer = setTimeout(() => {
      setPendingWeight(prev => prev === null ? 70 : prev);
    }, 200);
    return () => clearTimeout(timer);
  }, [recentRecords, pendingWeight]);

  // Extra edit field
  const [editWeight, setEditWeight] = useState("");

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<WeightRecord>({
    onOpen: (record) => setEditWeight(record.weight.toString()),
    buildUpdates: (timestamp, note) => {
      const newWeight = parseFloat(editWeight);
      if (isNaN(newWeight) || newWeight <= 0) {
        toast({ title: "Invalid weight", variant: "destructive" });
        return null;
      }
      return { weight: newWeight, timestamp, note };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const latestWeight = recentRecords?.[0];

  const handleDecrement = () => {
    setPendingWeight((prev) => {
      if (prev === null) return null;
      const next = Math.round((prev - settings.weightIncrement) * 10) / 10;
      return Math.max(0.1, next);
    });
  };

  const handleIncrement = () => {
    setPendingWeight((prev) => {
      if (prev === null) return null;
      return Math.round((prev + settings.weightIncrement) * 10) / 10;
    });
  };

  const handleSubmit = async () => {
    if (pendingWeight === null) return;
    const parsed = WeightFormSchema.safeParse({ weight: pendingWeight });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") errors[field] = issue.message;
      }
      setFieldErrors(errors);
      logAudit("validation_error", JSON.stringify({ form: "weight", errors: parsed.error.flatten() }).slice(0, 100));
      return;
    }
    setFieldErrors({});

    try {
      const timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
      await addMutation.mutateAsync({ weight: pendingWeight, ...(timestamp !== undefined && { timestamp }) });
      toast({
        title: "Weight recorded",
        description: `${pendingWeight.toFixed(1)} kg logged successfully`,
        variant: "success",
      });
      // Keep current value as starting point for next entry
      setShowTimeInput(false);
      setCustomTime(getCurrentDateTimeLocal());
    } catch (error) {
      console.error("Failed to record weight:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record weight",
        variant: "destructive",
      });
    }
  };

  return (
    <>
    <Card className={cn("relative overflow-hidden transition-all duration-300 bg-gradient-to-br", theme.gradient, theme.border)}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", theme.iconBg)}>
              <Icon className={cn("w-5 h-5", theme.iconColor)} />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">{theme.label}</span>
          </div>
          {isLoading ? (
            <div className="animate-pulse text-right">
              <div className={cn("h-6 w-16 rounded ml-auto", theme.loadingBg)} />
              <div className="h-4 w-24 bg-muted rounded mt-1 ml-auto" />
            </div>
          ) : latestWeight ? (
            <div className="text-right">
              <p className={cn("text-lg font-bold", theme.latestValueColor)}>
                {latestWeight.weight} kg
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(latestWeight.timestamp)}
              </p>
            </div>
          ) : null}
        </div>

        {/* Increment/Decrement Input Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            {/* Minus Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleDecrement}
              disabled={pendingWeight === null || pendingWeight <= settings.weightIncrement}
              className={cn("h-14 w-14 shrink-0 rounded-full transition-all", theme.hoverBg)}
            >
              <Minus className="w-6 h-6" />
            </Button>

            {/* Center Display */}
            <div className="flex-1 text-center">
              <span className="text-4xl font-bold tabular-nums">
                {pendingWeight?.toFixed(1) ?? "--"}
              </span>
              <span className="text-lg text-muted-foreground ml-1">kg</span>
            </div>

            {/* Plus Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleIncrement}
              disabled={pendingWeight === null}
              className={cn("h-14 w-14 shrink-0 rounded-full transition-all", theme.hoverBg)}
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          {fieldErrors.weight && (
            <p className="text-sm text-destructive text-center">{fieldErrors.weight}</p>
          )}

          <CollapsibleTimeInputControlled
            value={customTime}
            onChange={setCustomTime}
            expanded={showTimeInput}
            onToggle={() => setShowTimeInput(!showTimeInput)}
            id="weight-time"
          />

          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending || pendingWeight === null}
            className={cn("w-full h-11", theme.buttonBg)}
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Record Weight
              </>
            )}
          </Button>
        </div>

        {/* Recent History */}
        <RecentEntriesList
          records={recentRecords}
          deletingId={deletingId}
          onDelete={handleDelete}
          onEdit={openEdit}
          borderColor={theme.border}
          renderEntry={(record) => (
            <>
              <span className="text-muted-foreground">{formatDateTime(record.timestamp)}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{record.weight} kg</span>
              </div>
            </>
          )}
        />
      </CardContent>
    </Card>

    <EditWeightDialog
      record={editingRecord}
      onClose={closeEdit}
      onSubmit={handleEditSubmit}
      weight={editWeight}
      onWeightChange={setEditWeight}
      timestamp={editTimestamp}
      onTimestampChange={setEditTimestamp}
      note={editNote}
      onNoteChange={setEditNote}
    />
    </>
  );
}
