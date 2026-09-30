"use client";

import { useState, useEffect } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Minus, Plus, Check } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { z } from "zod";
import { CARD_THEMES } from "@/lib/card-themes";
import { ModuleCard, WhenLabel } from "@/components/home/module-card";
import { logAudit } from "@/lib/audit";
import { InlineEdit } from "@intake/ui/inline-edit";
import { Skeleton } from "@intake/ui/skeleton";
import {
  WEIGHT_RANGE_KG,
  parseWeightForm,
  roundWeightKg,
  weightRecordSchema,
} from "@intake/core/record-schemas";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@intake/ui/use-toast";
import { type WeightRecord } from "@/lib/db";
import { useWeightRecords, useAddWeight, useDeleteWeight, useUpdateWeight } from "@/hooks/use-health-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";
import { useFieldId, useOnLogged } from "@/components/log-form-scope";

const theme = CARD_THEMES.weight;

export function WeightCard() {
  const onLogged = useOnLogged();
  const fid = useFieldId();
  const { toast } = useToast();
  const settings = useSettings();
  const [pendingWeight, setPendingWeight] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const recentRecords = useWeightRecords(5);
  const isLoading = recentRecords === undefined;
  const addMutation = useAddWeight();
  const deleteMutation = useDeleteWeight();
  const updateMutation = useUpdateWeight();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Weight record removed", { undoToast: true });

  // Pre-fill with latest weight when records load.
  // recentRecords is undefined until Dexie resolves — no timing race.
  // A first-time user starts empty ("--"): a made-up default could be saved
  // with one tap and become the "latest weight".
  useEffect(() => {
    if (pendingWeight !== null) return;           // D-14: keep current value
    if (recentRecords === undefined) return;       // Still loading — wait
    const latest = recentRecords[0];
    if (latest) setPendingWeight(latest.weight);   // D-03: use last recorded
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
      const parsed = parseWeightForm({ weight: editWeight });
      if (!parsed.ok) {
        toast({ title: "Invalid weight", description: parsed.message, variant: "destructive" });
        return null;
      }
      // `null` clears the note (and the clear syncs).
      return { weight: parsed.data.weight, timestamp, note: note ?? null };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const latestWeight = recentRecords?.[0];

  const handleDecrement = () => {
    setPendingWeight((prev) => {
      if (prev === null) return null;
      const next = Math.round((prev - settings.weightIncrement) * 100) / 100;
      return Math.max(0.1, next);
    });
  };

  const handleIncrement = () => {
    setPendingWeight((prev) => {
      if (prev === null) return null;
      return Math.round((prev + settings.weightIncrement) * 100) / 100;
    });
  };

  const handleSubmit = async () => {
    if (pendingWeight === null) return;
    let timestamp: number | undefined;
    try {
      timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
    } catch {
      setFieldErrors({ timestamp: "Invalid date/time" });
      return;
    }
    const trimmedNote = note.trim();
    const parsed = weightRecordSchema(Date.now()).safeParse({
      weight: pendingWeight,
      ...(timestamp !== undefined && { timestamp }),
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") errors[field] = issue.message;
      }
      setFieldErrors(errors);
      logAudit("validation_error", JSON.stringify({ form: "weight", errors: z.flattenError(parsed.error) }).slice(0, 100));
      return;
    }
    setFieldErrors({});

    try {
      await addMutation.mutateAsync({
        weight: parsed.data.weight,
        ...(timestamp !== undefined && { timestamp }),
        ...(trimmedNote !== "" && { note: trimmedNote }),
        source: "manual",
      });
      toast({
        title: "Weight recorded",
        description: `${pendingWeight.toFixed(2)} kg logged successfully`,
        variant: "success",
      });
      onLogged();
      // Keep current value as starting point for next entry
      setNote("");
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
    <ModuleCard
      domain={theme.domain}
      icon={theme.icon}
      title={theme.label}
      data-testid="weight-card"
      right={
        isLoading ? (
          <span className="inline-block h-8 w-20 animate-pulse bg-foreground/10" />
        ) : latestWeight ? (
          <>
            <b>{latestWeight.weight.toFixed(2)} kg</b>
            <br />
            <WhenLabel timestamp={latestWeight.timestamp} />
          </>
        ) : null
      }
    >
      {/* Increment/Decrement Input Section */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-12 w-12 shrink-0" />
            <div className="flex-1 text-center">
              <Skeleton className="h-10 w-32 mx-auto" />
            </div>
            <Skeleton className="h-12 w-12 shrink-0" />
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-stretch justify-between gap-1.5">
            {/* Minus Button */}
            <Button
              size="icon"
              onClick={handleDecrement}
              disabled={pendingWeight === null || pendingWeight <= settings.weightIncrement}
              variant="secondary"
              className="h-12 w-12 shrink-0 text-xl"
              aria-label="Decrease weight"
            >
              <Minus className="w-5 h-5" />
            </Button>

            {/* Center Display — tap to type (D-01, D-02) */}
            <div className="flex flex-1 border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <InlineEdit
                // The label is the tap target: it must fill the whole box.
                className="h-full w-full items-center justify-center"
                value={pendingWeight}
                onValueChange={setPendingWeight}
                formatDisplay={(v) => v?.toFixed(2) ?? "--"}
                suffix="kg"
                displayClassName="text-2xl font-semibold num"
                suffixClassName="text-sm text-muted-foreground ml-1 num"
                // Keep the typed scale reading (2 dp). The increment only
                // drives the +/- buttons; out-of-range values are rejected
                // by the schema on Record rather than clamped here.
                roundOnBlur={roundWeightKg}
                clamp={false}
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.]?[0-9]*"
                aria-label="Weight in kilograms"
                data-testid="weight-direct-input"
              />
            </div>

            {/* Plus Button */}
            <Button
              size="icon"
              onClick={handleIncrement}
              disabled={pendingWeight === null}
              variant="secondary"
              className="h-12 w-12 shrink-0 text-xl"
              aria-label="Increase weight"
            >
              <Plus className="w-5 h-5" />
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
            id={fid("weight-time")}
          />
          {fieldErrors.timestamp && (
            <p className="text-sm text-destructive text-center">{fieldErrors.timestamp}</p>
          )}

          <Input
            aria-label="Weight note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-sm"
          />

          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending || pendingWeight === null}
            className="w-full"
          >
            {addMutation.isPending ? (
              <>
                <Spinner className="size-4 mr-2" />
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
      )}

      {/* Recent History */}
      <RecentEntriesList
        records={recentRecords}
        deletingId={deletingId}
        onDelete={handleDelete}
        onEdit={openEdit}
        editingId={editingRecord?.id ?? null}
        renderLabel={(record) => (
          <span className="text-muted-foreground">{record.note}</span>
        )}
        renderValue={(record) => `${record.weight.toFixed(2)} kg`}
        renderEditForm={() => (
          <InlineEditFormShell timestamp={editTimestamp} onTimestampChange={setEditTimestamp} note={editNote} onNoteChange={setEditNote} onSave={() => handleEditSubmit()} onCancel={closeEdit} buttonClassName={theme.buttonBg}>
            <Input type="number" step="any" min={WEIGHT_RANGE_KG.min} max={WEIGHT_RANGE_KG.max} placeholder="Weight (kg)" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="h-8 text-sm" />
          </InlineEditFormShell>
        )}
      />
    </ModuleCard>
  );
}
