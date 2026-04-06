"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { EditBloodPressureDialog } from "@/components/edit-blood-pressure-dialog";
import { EditEatingDialog } from "@/components/edit-eating-dialog";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
import { EditDefecationDialog } from "@/components/edit-defecation-dialog";
import { RecordRow } from "@/components/history/record-row";
import {
  History,
  Loader2,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord, type DefecationRecord } from "@/lib/db";
import {
  type UnifiedRecord,
  type FilterType,
  getRecordTimestamp,
  getRecordId,
  groupRecordsByDate,
  filterRecords,
} from "@/lib/history-types";
import { CARD_THEMES } from "@/lib/card-themes";
import { useUpdateIntake, useDeleteIntake } from "@/hooks/use-intake-queries";
import { useHistoryData } from "@/hooks/use-history-queries";
import { useUpdateWeight, useUpdateBloodPressure } from "@/hooks/use-health-queries";
import { useUpdateEating, useDeleteEating } from "@/hooks/use-eating-queries";
import { useUpdateUrination, useDeleteUrination } from "@/hooks/use-urination-queries";
import { useUpdateDefecation, useDeleteDefecation } from "@/hooks/use-defecation-queries";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardAwareScroll } from "@/hooks/use-keyboard-scroll";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { cn } from "@/lib/utils";
import {
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";

const PAGE_SIZE = 30;

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HistoryDrawer({ open, onOpenChange }: HistoryDrawerProps) {
  const { toast } = useToast();
  const { onFocus: scrollOnFocus } = useKeyboardAwareScroll();
  const { requirePin } = usePinProtected();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  // History data loader
  const { data: historyData, deleteWeight: historyDeleteWeight, deleteBP: historyDeleteBP } = useHistoryData();

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

  // Unified records state
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

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

  // Derive unified records from reactive history data
  useEffect(() => {
    if (!open || !historyData) return;

    const unified: UnifiedRecord[] = [
      ...historyData.intakeRecords.map((r) => ({ type: "intake" as const, record: r })),
      ...historyData.weightRecords.map((r) => ({ type: "weight" as const, record: r })),
      ...historyData.bpRecords.map((r) => ({ type: "bp" as const, record: r })),
      ...historyData.eatingRecords.map((r) => ({ type: "eating" as const, record: r })),
      ...historyData.urinationRecords.map((r) => ({ type: "urination" as const, record: r })),
      ...historyData.defecationRecords.map((r) => ({ type: "defecation" as const, record: r })),
    ];

    unified.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

    const end = page * PAGE_SIZE;
    setRecords(unified.slice(0, end));
    setHasMore(end < unified.length);
    setIsLoading(false);
  }, [open, historyData, page]);

  // Handle open change with PIN protection
  const handleOpenChange = useCallback(async (newOpen: boolean) => {
    if (newOpen) {
      const unlocked = await requirePin();
      if (unlocked) onOpenChange(true);
    } else {
      onOpenChange(false);
    }
  }, [requirePin, onOpenChange]);

  const loadMoreRecords = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setPage(prev => prev + 1);
  }, [hasMore, isLoadingMore]);

  // ── Delete handlers ──────────────────────────────────────────
  const handleDelete = useCallback(async (unified: UnifiedRecord) => {
    const id = getRecordId(unified);
    setDeletingId(id);
    try {
      if (unified.type === "intake") await deleteMutation.mutateAsync(id);
      else if (unified.type === "weight") await historyDeleteWeight(id);
      else if (unified.type === "bp") await historyDeleteBP(id);
      else if (unified.type === "eating") await deleteEatingMutation.mutateAsync(id);
      else if (unified.type === "urination") await deleteUrinationMutation.mutateAsync(id);
      else if (unified.type === "defecation") await deleteDefecationMutation.mutateAsync(id);

      setRecords((prev) => prev.filter((r) => getRecordId(r) !== id));
      toast({ title: "Entry deleted", description: "Record removed" });
    } catch {
      toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, [toast, deleteMutation, historyDeleteWeight, historyDeleteBP, deleteEatingMutation, deleteUrinationMutation, deleteDefecationMutation]);

  // ── Edit openers ─────────────────────────────────────────────
  const openEdit = useCallback((unified: UnifiedRecord) => {
    setEditTimestamp(timestampToDateTimeLocal(unified.record.timestamp));
    setEditNote((unified.record as { note?: string }).note || "");

    if (unified.type === "intake") {
      setEditingIntake(unified.record);
      setEditAmount(unified.record.amount.toString());
    } else if (unified.type === "weight") {
      setEditingWeight(unified.record);
      setEditWeight(unified.record.weight.toString());
    } else if (unified.type === "bp") {
      const r = unified.record;
      setEditingBP(r);
      setEditSystolic(r.systolic.toString());
      setEditDiastolic(r.diastolic.toString());
      setEditHeartRate(r.heartRate?.toString() || "");
      setEditPosition(r.position);
      setEditArm(r.arm);
    } else if (unified.type === "eating") {
      setEditingEating(unified.record);
    } else if (unified.type === "urination") {
      setEditingUrination(unified.record);
      setEditAmountUrination(unified.record.amountEstimate || "");
    } else if (unified.type === "defecation") {
      setEditingDefecation(unified.record);
      setEditAmountDefecation(unified.record.amountEstimate || "");
    }
  }, []);

  // ── Edit submit handlers ─────────────────────────────────────
  const handleEditIntakeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIntake) return;
    const newAmount = parseInt(editAmount, 10);
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    const newNote = editNote.trim() || undefined;
    if (isNaN(newAmount) || newAmount <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    const rec = editingIntake;
    try {
      await updateMutation.mutateAsync({ id: rec.id, updates: { amount: newAmount, timestamp: newTimestamp, ...(newNote !== undefined && { note: newNote }) } });
      setEditingIntake(null);
      const updatedRecord = { ...rec, amount: newAmount, timestamp: newTimestamp, ...(newNote !== undefined && { note: newNote }) };
      setRecords(prev => prev.map(r => r.type === "intake" && r.record.id === rec.id ? { ...r, record: updatedRecord } : r).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingIntake, editAmount, editTimestamp, editNote, toast, updateMutation]);

  const handleEditWeightSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeight) return;
    const newWeight = parseFloat(editWeight);
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newWeight) || newWeight <= 0) { toast({ title: "Invalid weight", variant: "destructive" }); return; }
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    const rec = editingWeight;
    try {
      const noteVal = editNote || undefined;
      await updateWeightMutation.mutateAsync({ id: rec.id, updates: { weight: newWeight, timestamp: newTimestamp, ...(noteVal !== undefined && { note: noteVal }) } });
      setEditingWeight(null);
      const updatedWeight = { ...rec, weight: newWeight, timestamp: newTimestamp, ...(noteVal !== undefined && { note: noteVal }) };
      setRecords(prev => prev.map(r => r.type === "weight" && r.record.id === rec.id ? { ...r, record: updatedWeight } : r).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
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
    const rec = editingBP;
    try {
      const bpNoteVal = editNote || undefined;
      await updateBPMutation.mutateAsync({ id: rec.id, updates: { systolic: newSystolic, diastolic: newDiastolic, ...(newHeartRate !== undefined && { heartRate: newHeartRate }), position: editPosition, arm: editArm, timestamp: newTimestamp, ...(bpNoteVal !== undefined && { note: bpNoteVal }) } });
      setEditingBP(null);
      const updatedBP = { ...rec, systolic: newSystolic, diastolic: newDiastolic, ...(newHeartRate !== undefined && { heartRate: newHeartRate }), position: editPosition, arm: editArm, timestamp: newTimestamp, ...(bpNoteVal !== undefined && { note: bpNoteVal }) };
      setRecords(prev => prev.map(r => r.type === "bp" && r.record.id === rec.id ? { ...r, record: updatedBP } : r).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update the entry", variant: "destructive" }); }
  }, [editingBP, editSystolic, editDiastolic, editHeartRate, editPosition, editArm, editTimestamp, editNote, toast, updateBPMutation]);

  const handleEditEatingSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEating) return;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    const rec = editingEating;
    try {
      const eatingNote = editNote.trim() || undefined;
      await updateEatingMutation.mutateAsync({ id: rec.id, updates: { timestamp: newTimestamp, ...(eatingNote !== undefined && { note: eatingNote }) } });
      setEditingEating(null);
      const updatedEating = { ...rec, timestamp: newTimestamp, ...(eatingNote !== undefined && { note: eatingNote }) };
      setRecords(prev => prev.map(r => r.type === "eating" && r.record.id === rec.id ? { ...r, record: updatedEating } : r).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingEating, editTimestamp, editNote, toast, updateEatingMutation]);

  const handleEditUrinationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUrination) return;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    const rec = editingUrination;
    try {
      const urinationAmt = editAmountUrination || undefined;
      const urinationNote = editNote.trim() || undefined;
      await updateUrinationMutation.mutateAsync({ id: rec.id, updates: { timestamp: newTimestamp, ...(urinationAmt !== undefined && { amountEstimate: urinationAmt }), ...(urinationNote !== undefined && { note: urinationNote }) } });
      setEditingUrination(null);
      const updatedUrination = { ...rec, timestamp: newTimestamp, ...(urinationAmt !== undefined && { amountEstimate: urinationAmt }), ...(urinationNote !== undefined && { note: urinationNote }) };
      setRecords(prev => prev.map(r => r.type === "urination" && r.record.id === rec.id ? { ...r, record: updatedUrination } : r).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingUrination, editTimestamp, editAmountUrination, editNote, toast, updateUrinationMutation]);

  const handleEditDefecationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDefecation) return;
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    if (isNaN(newTimestamp)) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    const rec = editingDefecation;
    try {
      const defecationAmt = editAmountDefecation || undefined;
      const defecationNote = editNote.trim() || undefined;
      await updateDefecationMutation.mutateAsync({ id: rec.id, updates: { timestamp: newTimestamp, ...(defecationAmt !== undefined && { amountEstimate: defecationAmt }), ...(defecationNote !== undefined && { note: defecationNote }) } });
      setEditingDefecation(null);
      const updatedDefecation = { ...rec, timestamp: newTimestamp, ...(defecationAmt !== undefined && { amountEstimate: defecationAmt }), ...(defecationNote !== undefined && { note: defecationNote }) };
      setRecords(prev => prev.map(r => r.type === "defecation" && r.record.id === rec.id ? { ...r, record: updatedDefecation } : r).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
      toast({ title: "Entry updated" });
    } catch { toast({ title: "Error", description: "Could not update", variant: "destructive" }); }
  }, [editingDefecation, editTimestamp, editAmountDefecation, editNote, toast, updateDefecationMutation]);

  // Filtered and grouped
  const filteredRecords = filterRecords(records, filter);
  const groupedRecords = groupRecordsByDate(filteredRecords);
  const dateGroups = Array.from(groupedRecords.entries());

  const FILTER_TABS: { value: FilterType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "water", label: "Water" },
    { value: "salt", label: "Salt" },
    { value: "weight", label: "Weight" },
    { value: "bp", label: "BP" },
    { value: "eating", label: "Eating" },
    { value: "urination", label: "Urination" },
    { value: "defecation", label: "Defecation" },
  ];

  const filterColorMap: Record<string, string> = {
    water: CARD_THEMES.water.buttonBg,
    salt: CARD_THEMES.salt.buttonBg,
    weight: CARD_THEMES.weight.buttonBg,
    bp: CARD_THEMES.bp.buttonBg,
    eating: CARD_THEMES.eating.buttonBg,
    urination: CARD_THEMES.urination.buttonBg,
    defecation: CARD_THEMES.defecation.buttonBg,
  };

  return (
    <>
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        <DrawerContent direction="bottom" className="h-[96vh] flex flex-col">
          <DrawerHeader className="border-b shrink-0">
            <DrawerTitle>Health History</DrawerTitle>
            <DrawerDescription>View and manage all your logged entries</DrawerDescription>

            {/* Filter Tabs */}
            <div className="flex gap-1 pt-2 overflow-x-auto">
              {FILTER_TABS.map((f) => (
                <Button
                  key={f.value}
                  variant={filter === f.value ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "text-xs shrink-0",
                    filter === f.value && f.value !== "all" && filterColorMap[f.value]
                  )}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No records yet</p>
                <p className="text-sm mt-1">Start logging to see history here</p>
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
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={loadMoreRecords} disabled={isLoadingMore} className="gap-2">
                      {isLoadingMore ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Loading...</>
                      ) : (
                        <><ChevronDown className="w-4 h-4" />Load More</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Edit Dialogs */}
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
