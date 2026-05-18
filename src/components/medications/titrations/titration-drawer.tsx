"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AlertTriangle, Loader2, Plus, TrendingUp } from "lucide-react";
import {
  useCreateTitrationPlan,
  usePhasesForTitrationPlan,
  useUpdateTitrationPlan,
} from "@/hooks/use-medication-queries";
import type { Prescription, TitrationPlan } from "@/lib/db";
import { useAiFetch } from "@/hooks/use-ai-fetch";
import { useAuthGate } from "@/components/auth-guard";
import { RxEntryCard, EditPhaseScheduleLoader } from "./rx-entry-card";
import { DAY_LABELS_LONG } from "./types";
import { useTitrationDrawerForm } from "./use-titration-drawer-form";

export function TitrationDrawer({
  open,
  onOpenChange,
  prescriptions,
  editingPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptions: Prescription[];
  editingPlan: TitrationPlan | null;
}) {
  const createMutation = useCreateTitrationPlan();
  const updateMutation = useUpdateTitrationPlan();
  const aiFetch = useAiFetch();
  const showAi = useAuthGate();
  const isEditing = editingPlan !== null;

  const editingPhases = usePhasesForTitrationPlan(editingPlan?.id);

  const form = useTitrationDrawerForm();
  const {
    title, setTitle,
    startNow, setStartNow,
    startDate, setStartDate,
    notes, setNotes,
    warnings, setWarnings,
    entries, setEntries,
    initialized, setInitialized,
    addEntry, removeEntry, updateEntry,
    addScheduleToEntry, removeScheduleFromEntry, updateScheduleInEntry,
    canSubmit, reset, prefillFromPlan,
  } = form;

  const [aiLoading, setAiLoading] = useState(false);
  const phasesReady = editingPhases.length > 0;

  useEffect(() => {
    if (open && isEditing && !initialized && phasesReady) {
      prefillFromPlan(editingPlan, editingPhases.map((p) => p.prescriptionId));
      setInitialized(true);
    } else if (!open && initialized) {
      setInitialized(false);
    }
    // editingPlan / editingPhases / prefillFromPlan / setInitialized intentionally omitted —
    // we only want to react to drawer open/close + the phases-ready transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, initialized, phasesReady]);

  const handleGenerateWarnings = async () => {
    const titrationRxIds = new Set(entries.filter((e) => e.prescriptionId).map((e) => e.prescriptionId));

    const changingRx = entries
      .filter((e) => e.prescriptionId)
      .map((e) => {
        const rx = prescriptions.find((p) => p.id === e.prescriptionId);
        const newSchedule = e.schedules
          .filter((s) => s.dosage)
          .map((s) => {
            const days = s.daysOfWeek.length === 7 ? "daily" : s.daysOfWeek.map((d) => DAY_LABELS_LONG[d]).join(", ");
            return `${s.dosage}mg at ${s.time} (${days})`;
          });
        const totalNew = e.schedules.reduce((sum, s) => sum + (parseFloat(s.dosage) || 0), 0);
        return {
          genericName: rx?.genericName ?? "Unknown",
          newSchedule: newSchedule.length > 0 ? newSchedule : undefined,
          newTotalDaily: totalNew > 0 ? `${totalNew}mg/day` : undefined,
          frequency: `${e.schedules.length}x daily`,
        };
      });

    const otherRx = prescriptions
      .filter((p) => !titrationRxIds.has(p.id))
      .map((p) => ({ genericName: p.genericName }));

    if (changingRx.length === 0) return;

    setAiLoading(true);
    try {
      const res = await aiFetch("/api/ai/titration-warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prescriptions: changingRx,
          otherMedications: otherRx.length > 0 ? otherRx : undefined,
          title: title || undefined,
        }),
      });

      if (res && res.ok) {
        const data = await res.json();
        if (data.warnings && Array.isArray(data.warnings)) {
          const existing = warnings.trim();
          const newWarnings = data.warnings.join("\n");
          setWarnings(existing ? `${existing}\n${newWarnings}` : newWarnings);
        }
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    const warningsList = warnings
      .split("\n")
      .map((w) => w.trim())
      .filter(Boolean);

    const firstRx = prescriptions.find(
      (p) => p.id === entries[0]?.prescriptionId,
    );
    const conditionLabel = firstRx?.indication || title.trim();

    const entryData = entries.map((e) => ({
      prescriptionId: e.prescriptionId,
      unit: "mg",
      schedules: e.schedules.map((s) => ({
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        dosage: parseFloat(s.dosage),
      })),
    }));

    const onSuccess = () => {
      reset();
      onOpenChange(false);
    };

    // Guard against empty/invalid startDate producing NaN timestamps.
    const parsedStart = startDate ? new Date(startDate + "T00:00:00").getTime() : NaN;
    const startDateField =
      !startNow && Number.isFinite(parsedStart)
        ? { recommendedStartDate: parsedStart }
        : {};

    if (isEditing) {
      updateMutation.mutate(
        {
          planId: editingPlan.id,
          title: title.trim(),
          conditionLabel,
          ...startDateField,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(warningsList.length > 0 ? { warnings: warningsList } : {}),
          entries: entryData,
        },
        { onSuccess },
      );
    } else {
      createMutation.mutate(
        {
          title: title.trim(),
          conditionLabel,
          startImmediately: startNow,
          ...startDateField,
          ...(notes.trim() && { notes: notes.trim() }),
          ...(warningsList.length > 0 && { warnings: warningsList }),
          entries: entryData,
        },
        { onSuccess },
      );
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col outline-none">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{isEditing ? "Edit Titration Plan" : "New Titration Plan"}</DrawerTitle>
        </DrawerHeader>

        {isEditing && editingPhases.map((phase, idx) => (
          <EditPhaseScheduleLoader
            key={phase.id}
            phaseId={phase.id}
            entryIdx={idx}
            onLoad={(schedules) => {
              setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, schedules } : e));
            }}
          />
        ))}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Title</Label>
            <Input
              placeholder="e.g. Heart failure dose increase"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Start</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  id="start-now"
                  checked={startNow}
                  onCheckedChange={setStartNow}
                />
                <Label htmlFor="start-now" className="text-sm cursor-pointer">
                  Start immediately
                </Label>
              </div>
              {!startNow && (
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Prescriptions</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={addEntry}
              >
                <Plus className="w-3 h-3" />
                Add Rx
              </Button>
            </div>

            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 border rounded-lg border-dashed text-center">
                Add at least one prescription to this plan.
              </p>
            )}

            {entries.map((entry, entryIdx) => (
              <RxEntryCard
                key={entryIdx}
                entry={entry}
                entryIdx={entryIdx}
                prescriptions={prescriptions}
                existingRxIds={entries.map((e) => e.prescriptionId).filter(Boolean)}
                onSelectPrescription={(rxId) => updateEntry(entryIdx, { prescriptionId: rxId })}
                onUpdate={(update) => updateEntry(entryIdx, update)}
                onRemove={() => removeEntry(entryIdx)}
                onAddSchedule={() => addScheduleToEntry(entryIdx)}
                onRemoveSchedule={(schedIdx) =>
                  removeScheduleFromEntry(entryIdx, schedIdx)
                }
                onUpdateSchedule={(schedIdx, update) =>
                  updateScheduleInEntry(entryIdx, schedIdx, update)
                }
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Warning Signs
              </Label>
              {showAi && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleGenerateWarnings}
                  disabled={aiLoading || entries.filter((e) => e.prescriptionId).length === 0}
                >
                  {aiLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <TrendingUp className="w-3 h-3" />
                  )}
                  {aiLoading ? "Generating..." : "AI Suggest"}
                </Button>
              )}
            </div>
            <Textarea
              placeholder={"Warning signs will appear here.\nYou can also type your own, one per line."}
              value={warnings}
              onChange={(e) => setWarnings(e.target.value)}
              rows={4}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Notes</Label>
            <Textarea
              placeholder="Additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="p-4 border-t shrink-0">
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending)
              ? (isEditing ? "Saving..." : "Creating...")
              : isEditing
                ? "Save Changes"
                : startNow
                  ? "Create & Activate"
                  : "Create Plan"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
