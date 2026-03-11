"use client";

import { useState, useRef, useCallback } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TitrationPhaseCard } from "@/components/medications/titration-phase-card";
import { Plus, Trash2 } from "lucide-react";
import {
  usePhasesForPrescription,
  useSchedulesForPhase,
  useStartNewPhase,
  useUpdatePrescription,
  type CreatePhaseInput,
} from "@/hooks/use-medication-queries";
import type { Prescription, MedicationPhase, FoodInstruction } from "@/lib/db";

interface PrescriptionDetailDrawerProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// Schedule Section
// ============================================================================

function ScheduleSection({ phases }: { phases: MedicationPhase[] }) {
  const activePhase = phases.find((p) => p.status === "active");

  if (!activePhase) {
    return (
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-2">Current Schedule</h3>
        <p className="text-xs text-muted-foreground">No active schedule</p>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold mb-2">Current Schedule</h3>
      <ActiveScheduleDisplay phase={activePhase} />
    </section>
  );
}

function ActiveScheduleDisplay({ phase }: { phase: MedicationPhase }) {
  const schedules = useSchedulesForPhase(phase.id);
  const enabled = schedules
    .filter((s) => s.enabled)
    .sort((a, b) => a.time.localeCompare(b.time));

  if (enabled.length === 0) {
    return <p className="text-xs text-muted-foreground">No schedules configured</p>;
  }

  const foodText =
    phase.foodInstruction === "before"
      ? "Take before eating"
      : phase.foodInstruction === "after"
        ? "Take after eating"
        : null;

  return (
    <div>
      {enabled.map((s) => (
        <p key={s.id} className="text-xs text-muted-foreground">
          {s.time} - {s.dosage}
          {phase.unit}
        </p>
      ))}
      {foodText && (
        <p className="text-xs text-muted-foreground/70 mt-1">{foodText}</p>
      )}
    </div>
  );
}

// ============================================================================
// Phases Section
// ============================================================================

function PhasesSection({
  phases,
  prescriptionId,
  currentUnit,
}: {
  phases: MedicationPhase[];
  prescriptionId: string;
  currentUnit: string;
}) {
  const [showForm, setShowForm] = useState(false);

  // Sort: active first, then pending, then completed/cancelled
  const statusOrder: Record<string, number> = {
    active: 0,
    pending: 1,
    completed: 2,
    cancelled: 3,
  };
  const sorted = [...phases].sort(
    (a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)
  );

  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold mb-2">Dosage Phases</h3>
      <div className="space-y-2">
        {sorted.map((phase) => (
          <TitrationPhaseCard
            key={phase.id}
            phase={phase}
            isOnly={phases.length <= 1}
          />
        ))}
      </div>

      {showForm ? (
        <NewPhaseForm
          prescriptionId={prescriptionId}
          defaultUnit={currentUnit}
          onClose={() => setShowForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3 text-xs"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3 h-3 mr-1" /> Plan new phase
        </Button>
      )}
    </section>
  );
}

// ============================================================================
// New Phase Form
// ============================================================================

interface ScheduleEntry {
  time: string;
  dosage: string;
  daysOfWeek: number[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function NewPhaseForm({
  prescriptionId,
  defaultUnit,
  onClose,
}: {
  prescriptionId: string;
  defaultUnit: string;
  onClose: () => void;
}) {
  const startNewPhase = useStartNewPhase();
  const [type, setType] = useState<"maintenance" | "titration">("maintenance");
  const [unit, setUnit] = useState(defaultUnit);
  const [foodInstruction, setFoodInstruction] = useState<FoodInstruction>("none");
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([
    { time: "08:00", dosage: "", daysOfWeek: ALL_DAYS },
  ]);

  const updateEntry = (index: number, updates: Partial<ScheduleEntry>) => {
    setScheduleEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...updates } : e))
    );
  };

  const addEntry = () => {
    setScheduleEntries((prev) => [
      ...prev,
      { time: "20:00", dosage: "", daysOfWeek: ALL_DAYS },
    ]);
  };

  const removeEntry = (index: number) => {
    if (scheduleEntries.length <= 1) return;
    setScheduleEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleDay = (entryIndex: number, day: number) => {
    const entry = scheduleEntries[entryIndex];
    if (!entry) return;
    const days = entry.daysOfWeek.includes(day)
      ? entry.daysOfWeek.filter((d) => d !== day)
      : [...entry.daysOfWeek, day].sort();
    updateEntry(entryIndex, { daysOfWeek: days });
  };

  const handleSubmit = () => {
    const validSchedules = scheduleEntries
      .filter((e) => e.dosage && parseFloat(e.dosage) > 0)
      .map((e) => ({
        time: e.time,
        dosage: parseFloat(e.dosage),
        daysOfWeek: e.daysOfWeek,
      }));

    if (validSchedules.length === 0) return;

    const input: CreatePhaseInput = {
      prescriptionId,
      type,
      unit,
      foodInstruction,
      startDate: Date.now(),
      schedules: validSchedules,
    };

    startNewPhase.mutate(input, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <Card className="p-3 mt-3 space-y-3">
      <h4 className="text-xs font-semibold">New Phase</h4>

      {/* Type selector */}
      <div className="flex gap-2">
        <Button
          variant={type === "maintenance" ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 flex-1"
          onClick={() => setType("maintenance")}
        >
          Maintenance
        </Button>
        <Button
          variant={type === "titration" ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 flex-1"
          onClick={() => setType("titration")}
        >
          Titration
        </Button>
      </div>

      {/* Unit */}
      <div>
        <Label className="text-xs">Unit</Label>
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="h-8 text-xs mt-1"
          placeholder="mg"
        />
      </div>

      {/* Food instruction */}
      <div>
        <Label className="text-xs">Food instruction</Label>
        <div className="flex gap-1 mt-1">
          {(["none", "before", "after"] as FoodInstruction[]).map((fi) => (
            <Button
              key={fi}
              variant={foodInstruction === fi ? "default" : "outline"}
              size="sm"
              className="text-xs h-7 flex-1 capitalize"
              onClick={() => setFoodInstruction(fi)}
            >
              {fi}
            </Button>
          ))}
        </div>
      </div>

      {/* Schedule entries */}
      <div className="space-y-3">
        <Label className="text-xs">Schedules</Label>
        {scheduleEntries.map((entry, idx) => (
          <div key={idx} className="border rounded-md p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={entry.time}
                onChange={(e) => updateEntry(idx, { time: e.target.value })}
                className="h-7 text-xs flex-1"
              />
              <Input
                type="number"
                value={entry.dosage}
                onChange={(e) => updateEntry(idx, { dosage: e.target.value })}
                placeholder="Dosage"
                className="h-7 text-xs w-20"
                step="any"
                min="0"
              />
              <span className="text-xs text-muted-foreground">{unit}</span>
              {scheduleEntries.length > 1 && (
                <button
                  onClick={() => removeEntry(idx)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            {/* Days of week */}
            <div className="flex gap-1">
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(idx, day)}
                  className={`text-[10px] w-7 h-6 rounded-md border transition-colors ${
                    entry.daysOfWeek.includes(day)
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
          variant="ghost"
          size="sm"
          className="text-xs h-7 w-full"
          onClick={addEntry}
        >
          <Plus className="w-3 h-3 mr-1" /> Add time
        </Button>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 flex-1"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="text-xs h-8 flex-1"
          onClick={handleSubmit}
          disabled={startNewPhase.isPending}
        >
          Create Phase
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// Notes Section
// ============================================================================

function NotesSection({ prescription }: { prescription: Prescription }) {
  const updatePrescription = useUpdatePrescription();
  const [notes, setNotes] = useState(prescription.notes ?? "");
  const lastSavedRef = useRef(prescription.notes ?? "");

  const handleBlur = useCallback(() => {
    const trimmed = notes.trim();
    if (trimmed === lastSavedRef.current) return;
    lastSavedRef.current = trimmed;
    updatePrescription.mutate({
      id: prescription.id,
      updates: { ...(trimmed ? { notes: trimmed } : { notes: "" }) },
    });
  }, [notes, prescription.id, updatePrescription]);

  return (
    <section>
      <h3 className="text-sm font-semibold mb-2">Notes</h3>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add notes about this prescription..."
        className="text-xs min-h-[80px] resize-none"
      />
    </section>
  );
}

// ============================================================================
// Main Drawer
// ============================================================================

export function PrescriptionDetailDrawer({
  prescription,
  open,
  onOpenChange,
}: PrescriptionDetailDrawerProps) {
  if (!prescription) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>{prescription.genericName}</DrawerTitle>
          {prescription.indication && (
            <DrawerDescription>{prescription.indication}</DrawerDescription>
          )}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <PrescriptionDetailContent prescription={prescription} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PrescriptionDetailContent({
  prescription,
}: {
  prescription: Prescription;
}) {
  const phases = usePhasesForPrescription(prescription.id);
  const activePhase = phases.find((p) => p.status === "active");
  const currentUnit = activePhase?.unit ?? "mg";

  return (
    <>
      <ScheduleSection phases={phases} />
      <PhasesSection
        phases={phases}
        prescriptionId={prescription.id}
        currentUnit={currentUnit}
      />
      <NotesSection prescription={prescription} />
    </>
  );
}
