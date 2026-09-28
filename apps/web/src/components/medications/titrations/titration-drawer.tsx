"use client";

import { useEffect, useState } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import { Textarea } from "@intake/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@intake/ui/drawer";
import { AlertTriangle, Loader2, Plus, TrendingUp } from "lucide-react";
import {
  useCreateTitrationPlan,
  usePhasesForPrescription,
  usePhasesForTitrationPlan,
  useSchedulesForPhase,
  useUpdateTitrationPlan,
} from "@/hooks/use-medication-queries";
import type { PhaseSchedule, Prescription, TitrationPlan } from "@/lib/db";
import { getMaintenancePhase } from "@/lib/medication-ui-utils";
import { summarizeRegimen } from "@/lib/titration-regimen";
import { useAiFetch } from "@/hooks/use-ai-fetch";
import { useToast } from "@intake/ui/use-toast";
import { readAiErrorMessage } from "@/lib/ai-error-message";
import { useAuthGate } from "@/components/auth-guard";
import { RxEntryCard, EditPhaseScheduleLoader } from "@/components/medications/titrations/rx-entry-card";
import { DAY_LABELS_LONG } from "@/components/medications/titrations/types";
import { sortDaysForDisplay } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useTitrationDrawerForm } from "@/components/medications/titrations/use-titration-drawer-form";

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
  const { toast } = useToast();
  const showAi = useAuthGate();
  const isEditing = editingPlan !== null;
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);

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
  // Each entry's current maintenance regimen, keyed by prescription id and
  // filled in by <CurrentRegimenLoader>.
  const [regimens, setRegimens] = useState<Record<string, CurrentRegimen | undefined>>({});
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

    const describeDays = (days: number[]) =>
      days.length === 7 ? "daily" : sortDaysForDisplay(days, weekStartsOn).map((d) => DAY_LABELS_LONG[d]).join(", ");

    // Doses are labelled in the prescription's own unit, the "daily" total is
    // averaged over the week (a Mon/Wed/Fri dose isn't daily), and the current
    // maintenance regimen is sent so the model can see the size of the change.
    const changingRx = entries
      .filter((e) => e.prescriptionId)
      .map((e) => {
        const rx = prescriptions.find((p) => p.id === e.prescriptionId);
        const current = regimens[e.prescriptionId];
        const unit = current?.unit ?? "mg";
        const newSchedule = e.schedules
          .filter((s) => s.dosage)
          .map((s) => `${s.dosage}${unit} at ${s.time} (${describeDays(s.daysOfWeek)})`);
        const newSummary = summarizeRegimen(
          e.schedules.map((s) => ({ dosage: parseFloat(s.dosage), daysOfWeek: s.daysOfWeek })),
          unit,
        );
        const currentSummary = current ? summarizeRegimen(current.schedules, unit) : undefined;
        const currentDosage = current && currentSummary
          ? `${currentSummary.averageDaily} (${current.schedules
            .map((s) => `${s.dosage}${unit} at ${s.time} (${describeDays(s.daysOfWeek)})`)
            .join("; ")})`
          : undefined;
        return {
          genericName: rx?.genericName ?? "Unknown",
          ...(currentDosage && { currentDosage }),
          newSchedule: newSchedule.length > 0 ? newSchedule : undefined,
          newTotalDaily: newSummary?.averageDaily,
          frequency: newSummary?.frequency,
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
      } else if (res) {
        // e.g. NO_AI_KEY: the route's message says where to add a key.
        toast({
          title: "Couldn't generate warnings",
          description: await readAiErrorMessage(res, "You can still type warnings manually."),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Couldn't generate warnings",
        description: "You can still type warnings manually.",
        variant: "destructive",
      });
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

    // No unit: the service inherits the prescription's own (mcg, ml, ...).
    const entryData = entries.map((e) => ({
      prescriptionId: e.prescriptionId,
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
      <DrawerContent className="max-h-[90dvh] flex flex-col outline-hidden">
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

        {Array.from(new Set(entries.map((e) => e.prescriptionId).filter(Boolean))).map((rxId) => (
          <CurrentRegimenLoader
            key={rxId}
            prescriptionId={rxId}
            onLoad={(regimen) => setRegimens((prev) => ({ ...prev, [rxId]: regimen }))}
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
            {!startNow && (
              <p className="text-[11px] text-muted-foreground">
                On this date you&apos;ll be asked to confirm the start. Your
                current doses stay in effect until you do.
              </p>
            )}
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

interface CurrentRegimen {
  unit: string;
  schedules: PhaseSchedule[];
}

/**
 * Reports a prescription's current maintenance regimen (unit + enabled
 * schedules) to the drawer, so the AI-warnings request can label doses in
 * the prescription's own unit and show what the titration changes from.
 */
export function CurrentRegimenLoader({
  prescriptionId,
  onLoad,
}: {
  prescriptionId: string;
  onLoad: (regimen: CurrentRegimen | undefined) => void;
}) {
  const phases = usePhasesForPrescription(prescriptionId);
  const maintenance = getMaintenancePhase(phases);
  const schedules = useSchedulesForPhase(maintenance?.id);
  const regimen: CurrentRegimen | undefined = maintenance
    ? { unit: maintenance.unit, schedules: schedules.filter((s) => s.enabled) }
    : undefined;
  // Keyed on content, not array identity: until Dexie resolves, useLiveQuery
  // returns a fresh default [] every render, and reporting on identity would
  // loop (report -> parent state -> re-render -> new [] -> report ...).
  const regimenKey = JSON.stringify(
    regimen && [regimen.unit, regimen.schedules.map((s) => [s.id, s.time, s.dosage, s.daysOfWeek])],
  );

  useEffect(() => {
    onLoad(regimen);
    // onLoad is an inline callback from the parent — including it in deps
    // would re-run on every parent render. We only need to react to data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regimenKey]);

  return null;
}
