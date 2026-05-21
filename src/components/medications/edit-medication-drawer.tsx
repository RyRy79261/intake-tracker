"use client";

import { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  usePhasesForPrescription,
  useSchedulesForPhase,
  useUpdatePrescription,
  useDeletePrescription,
  usePrescriptions,
  useUpdatePhase,
  useStartNewPhase,
} from "@/hooks/use-medication-queries";
import { getMaintenancePhase, getActiveTitrationPhase } from "@/lib/medication-ui-utils";
import type { Prescription, FoodInstruction } from "@/lib/db";
import { Loader2, Plus, Clock, Edit2, Check, X, Trash2, TrendingUp } from "lucide-react";
import { useMedicineSearch } from "@/hooks/use-medicine-search";

interface PrescriptionViewDrawerProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrescriptionViewDrawer({ prescription, open, onOpenChange }: PrescriptionViewDrawerProps) {
  const prescriptions = usePrescriptions();
  const currentPrescription = prescriptions.find(p => p.id === prescription?.id) || prescription;

  if (!currentPrescription) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{currentPrescription.genericName}</DrawerTitle>
          <p className="text-sm text-muted-foreground">
            {currentPrescription.indication || "Prescription"}
          </p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="schedule" className="w-full h-full flex flex-col">
            <div className="px-4 pt-4 shrink-0 border-b">
              <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-muted/50 rounded-lg mb-4">
                <TabsTrigger value="schedule" className="py-2 text-xs">Schedule</TabsTrigger>
                <TabsTrigger value="details" className="py-2 text-xs">Details</TabsTrigger>
                <TabsTrigger value="info" className="py-2 text-xs">Info</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="schedule" className="mt-0">
                <ScheduleTab prescription={currentPrescription} />
              </TabsContent>

              <TabsContent value="details" className="mt-0 space-y-6">
                <DetailsTab prescription={currentPrescription} onOpenChange={onOpenChange} />
              </TabsContent>

              <TabsContent value="info" className="mt-0">
                <InfoTab prescription={currentPrescription} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================================
// Schedule Tab — edit the maintenance ("baseline") schedule directly.
// Formal dosage changes go through the Titrations tab; this is for minor tweaks.
// ============================================================================

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface SchedRow {
  id?: string;
  time: string;
  dosage: string;
  daysOfWeek: number[];
}

function ScheduleTab({ prescription }: { prescription: Prescription }) {
  const phases = usePhasesForPrescription(prescription.id);
  const maintenancePhase = getMaintenancePhase(phases);
  const activeTitration = getActiveTitrationPhase(phases);
  const dbSchedules = useSchedulesForPhase(maintenancePhase?.id);
  const updatePhase = useUpdatePhase();
  const startNewPhase = useStartNewPhase();

  const [unit, setUnit] = useState("mg");
  const [foodInstruction, setFoodInstruction] = useState<FoodInstruction>("none");
  const [rows, setRows] = useState<SchedRow[]>([]);
  const [dirty, setDirty] = useState(false);

  // Hydrate from the DB whenever the maintenance phase or its schedules change,
  // unless the user has unsaved edits in progress.
  useEffect(() => {
    if (dirty) return;
    setUnit(maintenancePhase?.unit ?? "mg");
    setFoodInstruction(maintenancePhase?.foodInstruction ?? "none");
    setRows(
      dbSchedules.length > 0
        ? [...dbSchedules]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((s) => ({
              id: s.id,
              time: s.time,
              dosage: String(s.dosage),
              daysOfWeek: s.daysOfWeek,
            }))
        : [],
    );
  }, [maintenancePhase, dbSchedules, dirty]);

  const updateRow = (i: number, patch: Partial<SchedRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addRow = () => {
    setRows((prev) => [...prev, { time: "20:00", dosage: "", daysOfWeek: [...ALL_DAYS] }]);
    setDirty(true);
  };
  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const toggleDay = (i: number, day: number) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const has = r.daysOfWeek.includes(day);
        return {
          ...r,
          daysOfWeek: has
            ? r.daysOfWeek.filter((d) => d !== day)
            : [...r.daysOfWeek, day].sort((a, b) => a - b),
        };
      }),
    );
    setDirty(true);
  };

  const validRows = rows.filter(
    (r) => r.dosage && parseFloat(r.dosage) > 0 && r.daysOfWeek.length > 0,
  );
  const isSaving = updatePhase.isPending || startNewPhase.isPending;
  const canSave = dirty && validRows.length > 0 && !isSaving;

  const handleSave = async () => {
    if (validRows.length === 0) return;
    if (maintenancePhase) {
      await updatePhase.mutateAsync({
        id: maintenancePhase.id,
        unit,
        foodInstruction,
        schedules: validRows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          time: r.time,
          dosage: parseFloat(r.dosage),
          daysOfWeek: r.daysOfWeek,
        })),
      });
    } else {
      await startNewPhase.mutateAsync({
        prescriptionId: prescription.id,
        type: "maintenance",
        unit,
        foodInstruction,
        startDate: Date.now(),
        schedules: validRows.map((r) => ({
          time: r.time,
          dosage: parseFloat(r.dosage),
          daysOfWeek: r.daysOfWeek,
        })),
      });
    }
    setDirty(false);
  };

  const handleReset = () => setDirty(false);

  return (
    <div className="space-y-5 pb-4">
      {activeTitration && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            An active titration is currently in effect — today&apos;s doses follow
            the titration plan. Changes here update your baseline (maintenance)
            schedule, which resumes when the titration ends.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Edit the day-to-day schedule for minor tweaks. For a planned dose
        increase or decrease, create a plan in the Titrations tab instead.
      </p>

      {/* Unit */}
      <div className="space-y-1.5">
        <Label className="text-xs">Dosage unit</Label>
        <Input
          value={unit}
          onChange={(e) => { setUnit(e.target.value); setDirty(true); }}
          className="h-9 w-28"
          placeholder="mg"
        />
      </div>

      {/* Food instruction */}
      <div className="space-y-1.5">
        <Label className="text-xs">Food instruction</Label>
        <div className="flex gap-1">
          {(["none", "before", "after"] as FoodInstruction[]).map((fi) => (
            <Button
              key={fi}
              type="button"
              variant={foodInstruction === fi ? "default" : "outline"}
              size="sm"
              className="text-xs h-8 flex-1 capitalize"
              onClick={() => { setFoodInstruction(fi); setDirty(true); }}
            >
              {fi === "none" ? "Anytime" : `${fi} eating`}
            </Button>
          ))}
        </div>
      </div>

      {/* Schedule rows */}
      <div className="space-y-2">
        <Label className="text-xs">Daily doses</Label>
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
            No doses scheduled. Add a time below.
          </p>
        )}
        {rows.map((row, idx) => (
          <div key={row.id ?? `new-${idx}`} className="border rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={row.time}
                onChange={(e) => updateRow(idx, { time: e.target.value })}
                className="h-8 text-sm flex-1"
              />
              <Input
                type="number"
                step="any"
                min="0"
                value={row.dosage}
                onChange={(e) => updateRow(idx, { dosage: e.target.value })}
                placeholder="Dose"
                className="h-8 text-sm w-20"
              />
              <span className="text-xs text-muted-foreground w-8">{unit}</span>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remove dose"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-1">
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(idx, day)}
                  className={`text-[10px] flex-1 h-6 rounded-md border transition-colors ${
                    row.daysOfWeek.includes(day)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-input hover:bg-muted"
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-8 w-full"
          onClick={addRow}
        >
          <Plus className="w-3 h-3 mr-1" /> Add time
        </Button>
      </div>

      {dirty && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 text-xs"
            onClick={handleReset}
            disabled={isSaving}
          >
            Discard
          </Button>
          <Button
            size="sm"
            className="flex-1 h-9 text-xs bg-teal-600 hover:bg-teal-700"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save schedule"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Details Tab — name, indication, notes, active toggle, delete.
// ============================================================================

function DetailsTab({ prescription, onOpenChange }: { prescription: Prescription, onOpenChange: (open: boolean) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(prescription.genericName);
  const [indication, setIndication] = useState(prescription.indication);
  const [notes, setNotes] = useState(prescription.notes || "");
  const [isActive, setIsActive] = useState(prescription.isActive);

  const updatePrescription = useUpdatePrescription();
  const deletePrescription = useDeletePrescription();

  useEffect(() => {
    setName(prescription.genericName);
    setIndication(prescription.indication);
    setNotes(prescription.notes || "");
    setIsActive(prescription.isActive);
    setIsEditing(false);
  }, [prescription]);

  const handleSave = async () => {
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: { genericName: name, indication, notes, isActive },
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm("Permanently delete this prescription and all its history? This cannot be undone.")) {
      await deletePrescription.mutateAsync(prescription.id);
      onOpenChange(false);
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    setIsActive(checked);
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: { isActive: checked },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Prescription Details</h3>
        {!isEditing ? (
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setIsEditing(true)}>
            <Edit2 className="w-3 h-3" /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-teal-600" onClick={handleSave} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm">Active Prescription</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to hide from daily tracking
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason for use</Label>
            <Input value={indication} onChange={(e) => setIndication(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm">Active Prescription</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to hide from daily tracking
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={handleToggleActive} />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Reason for use</p>
            <p className="text-sm font-medium">{prescription.indication || "None specified"}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm bg-muted/30 p-3 rounded-lg border">
              {prescription.notes || "No notes added."}
            </p>
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDelete}
              disabled={deletePrescription.isPending}
            >
              {deletePrescription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Prescription"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Info Tab — AI-assisted contraindications & warnings.
// ============================================================================

function InfoTab({ prescription }: { prescription: Prescription }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAiData, setPendingAiData] = useState<{ contraindications: string[], warnings: string[] } | null>(null);
  const [isEditingAiData, setIsEditingAiData] = useState(false);
  const [editContraindications, setEditContraindications] = useState("");
  const [editWarnings, setEditWarnings] = useState("");

  const updatePrescription = useUpdatePrescription();
  const searchMutation = useMedicineSearch();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await searchMutation.mutateAsync(prescription.genericName);
      if (result) {
        setPendingAiData({
          contraindications: result.contraindications || [],
          warnings: result.warnings || [],
        });
      }
    } catch (e) {
      console.error("Failed to refresh AI data", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAccept = async () => {
    if (!pendingAiData) return;
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: {
        contraindications: pendingAiData.contraindications,
        warnings: pendingAiData.warnings,
      },
    });
    setPendingAiData(null);
  };

  const handleReject = () => {
    setPendingAiData(null);
    setIsEditingAiData(false);
  };

  const startEditing = () => {
    if (!pendingAiData) return;
    setEditContraindications(pendingAiData.contraindications.join("\n"));
    setEditWarnings(pendingAiData.warnings.join("\n"));
    setIsEditingAiData(true);
  };

  const saveEdits = async () => {
    const newContraindications = editContraindications.split("\n").map(s => s.trim()).filter(Boolean);
    const newWarnings = editWarnings.split("\n").map(s => s.trim()).filter(Boolean);

    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: {
        contraindications: newContraindications,
        warnings: newWarnings,
      },
    });
    setPendingAiData(null);
    setIsEditingAiData(false);
  };

  if (pendingAiData) {
    if (isEditingAiData) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Edit AI Information</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-red-500 dark:text-red-400">Contraindications (one per line)</Label>
              <Textarea
                value={editContraindications}
                onChange={(e) => setEditContraindications(e.target.value)}
                className="resize-none"
                rows={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-amber-500 dark:text-amber-400">Warnings (one per line)</Label>
              <Textarea
                value={editWarnings}
                onChange={(e) => setEditWarnings(e.target.value)}
                className="resize-none"
                rows={5}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button size="sm" variant="ghost" onClick={() => setIsEditingAiData(false)}>Cancel</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={saveEdits} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Review AI Information</h3>
        </div>

        <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-50/30 dark:bg-teal-950/10 space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-xs text-red-500 dark:text-red-400">New Contraindications</h4>
            {pendingAiData.contraindications.length > 0 ? (
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                {pendingAiData.contraindications.map((c, i) => (
                  <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None found.</p>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-xs text-amber-500 dark:text-amber-400">New Warnings</h4>
            {pendingAiData.warnings.length > 0 ? (
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                {pendingAiData.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None found.</p>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button size="sm" variant="ghost" onClick={handleReject}>Reject</Button>
            <Button size="sm" variant="outline" onClick={startEditing}>Edit</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleAccept} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Accept"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI Information</h3>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={handleRefresh} disabled={isRefreshing || updatePrescription.isPending}>
          {isRefreshing || updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          Refresh AI Data
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-red-500 dark:text-red-400">Contraindications</h3>
        {prescription.contraindications && prescription.contraindications.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.contraindications.map((c, i) => (
              <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No contraindications listed.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-amber-500 dark:text-amber-400">Warnings</h3>
        {prescription.warnings && prescription.warnings.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No warnings listed.
          </p>
        )}
      </div>
    </div>
  );
}
