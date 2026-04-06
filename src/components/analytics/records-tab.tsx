"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RecordRow } from "@/components/history/record-row";
import { useSettings } from "@/hooks/use-settings";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { EditBloodPressureDialog } from "@/components/edit-blood-pressure-dialog";
import { EditEatingDialog } from "@/components/edit-eating-dialog";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
import { EditDefecationDialog } from "@/components/edit-defecation-dialog";
import {
  Calendar,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import {
  type IntakeRecord,
  type WeightRecord,
  type BloodPressureRecord,
  type EatingRecord,
  type UrinationRecord,
  type DefecationRecord,
} from "@/lib/db";
import {
  type FilterType,
  getRecordId,
  groupRecordsByDate,
  filterRecords,
} from "@/lib/history-types";
import { CARD_THEMES } from "@/lib/card-themes";
import { useRecordsTabData } from "@/hooks/use-records-tab-queries";
import { useUpdateIntake, useDeleteIntake } from "@/hooks/use-intake-queries";
import { useUpdateWeight, useUpdateBloodPressure } from "@/hooks/use-health-queries";
import { useUpdateEating, useDeleteEating } from "@/hooks/use-eating-queries";
import { useUpdateUrination, useDeleteUrination } from "@/hooks/use-urination-queries";
import { useUpdateDefecation, useDeleteDefecation } from "@/hooks/use-defecation-queries";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardAwareScroll } from "@/hooks/use-keyboard-scroll";
import { cn } from "@/lib/utils";
import {
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";
import type { TimeRange } from "@/lib/analytics-types";

const PAGE_SIZE = 50;

interface RecordsTabProps {
  range: TimeRange;
}

const FILTER_TABS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "water", label: "Water" },
  { value: "salt", label: "Salt" },
  { value: "weight", label: "Weight" },
  { value: "bp", label: "BP" },
  { value: "eating", label: "Eating" },
  { value: "urination", label: "Urination" },
  { value: "defecation", label: "Defecation" },
  { value: "caffeine", label: "Caffeine" },
  { value: "alcohol", label: "Alcohol" },
];

const filterColorMap: Record<string, string> = {
  water: CARD_THEMES.water.buttonBg,
  salt: CARD_THEMES.salt.buttonBg,
  weight: CARD_THEMES.weight.buttonBg,
  bp: CARD_THEMES.bp.buttonBg,
  eating: CARD_THEMES.eating.buttonBg,
  urination: CARD_THEMES.urination.buttonBg,
  defecation: CARD_THEMES.defecation.buttonBg,
  caffeine: CARD_THEMES.caffeine.buttonBg,
  alcohol: CARD_THEMES.alcohol.buttonBg,
};

export function RecordsTab({ range }: RecordsTabProps) {
  const { toast } = useToast();
  const { onFocus: scrollOnFocus } = useKeyboardAwareScroll();
  const settings = useSettings();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);

  // Reset page when range changes
  useEffect(() => {
    setPage(1);
  }, [range.start, range.end]);

  // Fetch all domain records via hook
  const { data: allRecords, deleteWeight, deleteBP, deleteSubstance } = useRecordsTabData(range);

  // Mutations
  const updateMutation = useUpdateIntake();
  const deleteMutation = useDeleteIntake();
  const updateWeightMutation = useUpdateWeight();
  const updateBPMutation = useUpdateBloodPressure();
  const updateEatingMutation = useUpdateEating();
  const deleteEatingMutation = useDeleteEating();
  const updateUrinationMutation = useUpdateUrination();
  const deleteUrinationMutation = useDeleteUrination();
  const updateDefecationMutation = useUpdateDefecation();
  const deleteDefecationMutation = useDeleteDefecation();

  // Edit dialog states
  const [editingIntake, setEditingIntake] = useState<IntakeRecord | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightRecord | null>(null);
  const [editingBP, setEditingBP] = useState<BloodPressureRecord | null>(null);
  const [editingEating, setEditingEating] = useState<EatingRecord | null>(null);
  const [editingUrination, setEditingUrination] = useState<UrinationRecord | null>(null);
  const [editingDefecation, setEditingDefecation] = useState<DefecationRecord | null>(null);

  // Edit form states
  const [editAmount, setEditAmount] = useState("");
  const [editTimestamp, setEditTimestamp] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSystolic, setEditSystolic] = useState("");
  const [editDiastolic, setEditDiastolic] = useState("");
  const [editHeartRate, setEditHeartRate] = useState("");
  const [editPosition, setEditPosition] = useState<"sitting" | "standing">("sitting");
  const [editArm, setEditArm] = useState<"left" | "right">("left");
  const [editAmountUrination, setEditAmountUrination] = useState("");
  const [editAmountDefecation, setEditAmountDefecation] = useState("");

  // Filter + paginate
  const filteredRecords = filterRecords(allRecords, filter);
  const visibleEnd = page * PAGE_SIZE;
  const visibleRecords = filteredRecords.slice(0, visibleEnd);
  const hasMore = visibleEnd < filteredRecords.length;

  const groupedRecords = groupRecordsByDate(visibleRecords);
  const dateGroups = Array.from(groupedRecords.entries());

  // Delete handler
  const handleDelete = useCallback(async (unified: import("@/lib/history-types").UnifiedRecord) => {
    const id = getRecordId(unified);
    setDeletingId(id);
    try {
      if (unified.type === "intake") await deleteMutation.mutateAsync(id);
      else if (unified.type === "weight") await deleteWeight(id);
      else if (unified.type === "bp") await deleteBP(id);
      else if (unified.type === "eating") await deleteEatingMutation.mutateAsync(id);
      else if (unified.type === "urination") await deleteUrinationMutation.mutateAsync(id);
      else if (unified.type === "defecation") await deleteDefecationMutation.mutateAsync(id);
      else if (unified.type === "caffeine" || unified.type === "alcohol") await deleteSubstance(id);
      toast({ title: "Entry deleted", description: "Record removed" });
    } catch {
      toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, [toast, deleteMutation, deleteWeight, deleteBP, deleteEatingMutation, deleteUrinationMutation, deleteDefecationMutation, deleteSubstance]);

  // Edit openers
  const openEdit = useCallback((unified: import("@/lib/history-types").UnifiedRecord) => {
    setEditTimestamp(timestampToDateTimeLocal(unified.record.timestamp));
    setEditNote((unified.record as unknown as { note?: string }).note || "");

    if (unified.type === "intake") {
      setEditingIntake(unified.record);
      setEditAmount(unified.record.amount.toString());
    } else if (unified.type === "weight") {
      setEditingWeight(unified.record);
      setEditWeight(unified.record.weight.toString());
    } else if (unified.type === "bp") {
      setEditingBP(unified.record);
      setEditSystolic(unified.record.systolic.toString());
      setEditDiastolic(unified.record.diastolic.toString());
      setEditHeartRate(unified.record.heartRate?.toString() || "");
      setEditPosition(unified.record.position);
      setEditArm(unified.record.arm);
    } else if (unified.type === "eating") {
      setEditingEating(unified.record);
    } else if (unified.type === "urination") {
      setEditingUrination(unified.record);
      setEditAmountUrination(unified.record.amountEstimate || "");
    } else if (unified.type === "defecation") {
      setEditingDefecation(unified.record);
      setEditAmountDefecation(unified.record.amountEstimate || "");
    }
    // Substance records (caffeine/alcohol) have no edit dialog -- delete only
  }, []);

  // Edit submit handlers
  const handleEditIntakeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIntake) return;
    const newAmount = parseInt(editAmount, 10);
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    const newNote = editNote.trim() || undefined;
    if (isNaN(newAmount) || newAmount <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    try {
      await updateMutation.mutateAsync({ id: editingIntake.id, updates: { amount: newAmount, timestamp: newTimestamp, ...(newNote !== undefined && { note: newNote }) } });
      setEditingIntake(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingIntake, editAmount, editTimestamp, editNote, toast, updateMutation]);

  const handleEditWeightSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeight) return;
    const newW = parseFloat(editWeight);
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newW) || newW <= 0) { toast({ title: "Invalid weight", variant: "destructive" }); return; }
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    try {
      const noteVal = editNote || undefined;
      await updateWeightMutation.mutateAsync({ id: editingWeight.id, updates: { weight: newW, timestamp: newTimestamp, ...(noteVal !== undefined && { note: noteVal }) } });
      setEditingWeight(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingWeight, editWeight, editTimestamp, editNote, toast, updateWeightMutation]);

  const handleEditBPSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBP) return;
    const newSystolic = parseInt(editSystolic, 10);
    const newDiastolic = parseInt(editDiastolic, 10);
    const newHeartRate = editHeartRate ? parseInt(editHeartRate, 10) : undefined;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newSystolic) || isNaN(newDiastolic) || newSystolic <= 0 || newDiastolic <= 0) { toast({ title: "Invalid values", variant: "destructive" }); return; }
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    try {
      const bpNoteVal = editNote || undefined;
      await updateBPMutation.mutateAsync({ id: editingBP.id, updates: { systolic: newSystolic, diastolic: newDiastolic, ...(newHeartRate !== undefined && { heartRate: newHeartRate }), position: editPosition, arm: editArm, timestamp: newTimestamp, ...(bpNoteVal !== undefined && { note: bpNoteVal }) } });
      setEditingBP(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingBP, editSystolic, editDiastolic, editHeartRate, editPosition, editArm, editTimestamp, editNote, toast, updateBPMutation]);

  const handleEditEatingSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEating) return;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    try {
      const eatingNote = editNote.trim() || undefined;
      await updateEatingMutation.mutateAsync({ id: editingEating.id, updates: { timestamp: newTimestamp, ...(eatingNote !== undefined && { note: eatingNote }) } });
      setEditingEating(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingEating, editTimestamp, editNote, toast, updateEatingMutation]);

  const handleEditUrinationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUrination) return;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    try {
      const urinationAmt = editAmountUrination || undefined;
      const urinationNote = editNote.trim() || undefined;
      await updateUrinationMutation.mutateAsync({ id: editingUrination.id, updates: { timestamp: newTimestamp, ...(urinationAmt !== undefined && { amountEstimate: urinationAmt }), ...(urinationNote !== undefined && { note: urinationNote }) } });
      setEditingUrination(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingUrination, editTimestamp, editAmountUrination, editNote, toast, updateUrinationMutation]);

  const handleEditDefecationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDefecation) return;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    try {
      const defecationAmt = editAmountDefecation || undefined;
      const defecationNote = editNote.trim() || undefined;
      await updateDefecationMutation.mutateAsync({ id: editingDefecation.id, updates: { timestamp: newTimestamp, ...(defecationAmt !== undefined && { amountEstimate: defecationAmt }), ...(defecationNote !== undefined && { note: defecationNote }) } });
      setEditingDefecation(null);
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingDefecation, editTimestamp, editAmountDefecation, editNote, toast, updateDefecationMutation]);

  return (
    <>
      {/* Domain filter */}
      <div className="mb-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {FILTER_TABS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              className={cn(
                "text-xs shrink-0",
                filter === f.value && f.value !== "all" && filterColorMap[f.value]
              )}
              onClick={() => { setFilter(f.value); setPage(1); }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Records list */}
      <div className="min-h-[40vh]">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No records in this time range</p>
          </div>
        ) : (
          <div className="space-y-6">
            {dateGroups.map(([date, dayRecords]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {date}
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {dayRecords.length} {dayRecords.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                <div className="border-t border-border/50">
                  {dayRecords.map((unified) => (
                    <RecordRow
                      key={unified.record.id}
                      unified={unified}
                      onDelete={() => handleDelete(unified)}
                      onEdit={() => openEdit(unified)}
                      isDeleting={deletingId === unified.record.id}
                      liquidPresets={settings.liquidPresets}
                    />
                  ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4 pb-8">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  className="gap-2"
                >
                  <ChevronDown className="w-4 h-4" />
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit dialogs */}
      <EditIntakeDialog
        record={editingIntake}
        onClose={() => setEditingIntake(null)}
        onSubmit={handleEditIntakeSubmit}
        amount={editAmount}
        onAmountChange={setEditAmount}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditWeightDialog
        record={editingWeight}
        onClose={() => setEditingWeight(null)}
        onSubmit={handleEditWeightSubmit}
        weight={editWeight}
        onWeightChange={setEditWeight}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditBloodPressureDialog
        record={editingBP}
        onClose={() => setEditingBP(null)}
        onSubmit={handleEditBPSubmit}
        systolic={editSystolic}
        onSystolicChange={setEditSystolic}
        diastolic={editDiastolic}
        onDiastolicChange={setEditDiastolic}
        heartRate={editHeartRate}
        onHeartRateChange={setEditHeartRate}
        position={editPosition}
        onPositionChange={setEditPosition}
        arm={editArm}
        onArmChange={setEditArm}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditEatingDialog
        record={editingEating}
        onClose={() => setEditingEating(null)}
        onSubmit={handleEditEatingSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditUrinationDialog
        record={editingUrination}
        onClose={() => setEditingUrination(null)}
        onSubmit={handleEditUrinationSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        amount={editAmountUrination}
        onAmountChange={setEditAmountUrination}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
      <EditDefecationDialog
        record={editingDefecation}
        onClose={() => setEditingDefecation(null)}
        onSubmit={handleEditDefecationSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        amount={editAmountDefecation}
        onAmountChange={setEditAmountDefecation}
        note={editNote}
        onNoteChange={setEditNote}
        onFocus={scrollOnFocus}
      />
    </>
  );
}
