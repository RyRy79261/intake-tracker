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
import {
  History,
  Droplets,
  Sparkles,
  Trash2,
  Calendar,
  Loader2,
  ChevronDown,
  Pencil,
  Scale,
  Heart,
  Utensils,
  Droplet,
} from "lucide-react";
import { type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord } from "@/lib/db";
import { getRecordsByCursor } from "@/lib/intake-service";
import { getWeightRecords, deleteWeightRecord, getBloodPressureRecords, deleteBloodPressureRecord } from "@/lib/health-service";
import { getEatingRecords } from "@/lib/eating-service";
import { getUrinationRecords } from "@/lib/urination-service";
import { useUpdateIntake, useDeleteIntake } from "@/hooks/use-intake-queries";
import { useUpdateWeight, useUpdateBloodPressure } from "@/hooks/use-health-queries";
import { useUpdateEating, useDeleteEating } from "@/hooks/use-eating-queries";
import { useUpdateUrination, useDeleteUrination } from "@/hooks/use-urination-queries";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardAwareScroll } from "@/hooks/use-keyboard-scroll";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { cn } from "@/lib/utils";

// Unified record type for display
type UnifiedRecord =
  | { type: "intake"; record: IntakeRecord }
  | { type: "weight"; record: WeightRecord }
  | { type: "bp"; record: BloodPressureRecord }
  | { type: "eating"; record: EatingRecord }
  | { type: "urination"; record: UrinationRecord };

import {
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatTimeOnly,
} from "@/lib/date-utils";

type FilterType = "all" | "water" | "salt" | "weight" | "bp" | "eating" | "urination";

// Get timestamp from unified record
function getRecordTimestamp(unified: UnifiedRecord): number {
  return unified.record.timestamp;
}

// Get record ID from unified record
function getRecordId(unified: UnifiedRecord): string {
  return unified.record.id;
}

// Group records by date
function groupRecordsByDate(records: UnifiedRecord[]): Map<string, UnifiedRecord[]> {
  const groups = new Map<string, UnifiedRecord[]>();

  for (const unified of records) {
    const date = new Date(getRecordTimestamp(unified));
    const dateKey = date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(unified);
  }

  return groups;
}

// Record Row - clickable to edit, with action buttons
function RecordRow({
  unified,
  onDelete,
  onEdit,
  isDeleting,
}: {
  unified: UnifiedRecord;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
}) {
  let icon: React.ReactNode;
  let measurement: string;
  let iconColor: string;

  if (unified.type === "intake") {
    const record = unified.record;
    const isWater = record.type === "water";
    icon = isWater ? <Droplets className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />;
    iconColor = isWater ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400";
    measurement = `${record.amount} ${isWater ? "ml" : "mg"}`;
  } else if (unified.type === "weight") {
    const record = unified.record;
    icon = <Scale className="w-4 h-4" />;
    iconColor = "text-emerald-600 dark:text-emerald-400";
    measurement = `${record.weight} kg`;
  } else if (unified.type === "eating") {
    const record = unified.record;
    icon = <Utensils className="w-4 h-4" />;
    iconColor = "text-orange-600 dark:text-orange-400";
    measurement = record.note ? record.note : "—";
  } else if (unified.type === "urination") {
    const record = unified.record;
    icon = <Droplet className="w-4 h-4" />;
    iconColor = "text-violet-600 dark:text-violet-400";
    const parts = [record.amountEstimate, record.note].filter(Boolean);
    measurement = parts.length > 0 ? parts.join(" · ") : "—";
  } else {
    const record = unified.record;
    icon = <Heart className="w-4 h-4" />;
    iconColor = "text-rose-600 dark:text-rose-400";
    measurement = `${record.systolic}/${record.diastolic} mmHg`;
  }

  return (
    <div 
      className="flex items-center justify-between py-2 px-3 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={iconColor}>{icon}</span>
        <span className="font-medium">{measurement}</span>
        <span className="text-sm text-muted-foreground">{formatTimeOnly(unified.record.timestamp)}</span>
      </div>
      <div 
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={onEdit}
          aria-label="Edit entry"
          title="Edit entry"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete entry"
          title="Delete entry"
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

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

  // Mutations
  const updateMutation = useUpdateIntake();
  const deleteMutation = useDeleteIntake();
  const updateWeightMutation = useUpdateWeight();
  const updateBPMutation = useUpdateBloodPressure();
  const updateEatingMutation = useUpdateEating();
  const deleteEatingMutation = useDeleteEating();
  const updateUrinationMutation = useUpdateUrination();
  const deleteUrinationMutation = useDeleteUrination();

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

  // Load all records
  const loadAllRecords = useCallback(async (pageNum: number = 1) => {
    const isInitial = pageNum === 1;
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const pageSize = 30;
      
      let intakeRecords: IntakeRecord[] = [];
      let weightRecordsData: WeightRecord[] = [];
      let bpRecordsData: BloodPressureRecord[] = [];
      let eatingRecordsData: EatingRecord[] = [];
      let urinationRecordsData: UrinationRecord[] = [];

      try {
        const result = await getRecordsByCursor(undefined, 100);
        intakeRecords = result.records;
      } catch (e) {
        console.error("Failed to load intake records:", e);
      }

      try {
        weightRecordsData = await getWeightRecords(100);
      } catch (e) {
        console.error("Failed to load weight records:", e);
      }

      try {
        bpRecordsData = await getBloodPressureRecords(100);
      } catch (e) {
        console.error("Failed to load BP records:", e);
      }

      try {
        eatingRecordsData = await getEatingRecords(100);
      } catch (e) {
        console.error("Failed to load eating records:", e);
      }

      try {
        urinationRecordsData = await getUrinationRecords(100);
      } catch (e) {
        console.error("Failed to load urination records:", e);
      }

      const unified: UnifiedRecord[] = [
        ...intakeRecords.map((r) => ({ type: "intake" as const, record: r })),
        ...weightRecordsData.map((r) => ({ type: "weight" as const, record: r })),
        ...bpRecordsData.map((r) => ({ type: "bp" as const, record: r })),
        ...eatingRecordsData.map((r) => ({ type: "eating" as const, record: r })),
        ...urinationRecordsData.map((r) => ({ type: "urination" as const, record: r })),
      ];

      unified.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

      const start = (pageNum - 1) * pageSize;
      const end = start + pageSize;

      if (isInitial) {
        setRecords(unified.slice(0, pageSize));
      } else {
        const newPageRecords = unified.slice(start, end);
        setRecords(prev => [...prev, ...newPageRecords]);
      }
      setHasMore(end < unified.length);
      setPage(pageNum);
    } catch (error) {
      console.error("Failed to load history:", error);
      toast({
        title: "Error",
        description: "Could not load history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [toast]);

  // Load records when drawer opens
  useEffect(() => {
    if (open) {
      loadAllRecords(1);
    }
  }, [open, loadAllRecords]);

  // Handle open change with PIN protection
  const handleOpenChange = useCallback(async (newOpen: boolean) => {
    if (newOpen) {
      const unlocked = await requirePin();
      if (unlocked) {
        onOpenChange(true);
      }
    } else {
      onOpenChange(false);
    }
  }, [requirePin, onOpenChange]);

  // Load more records
  const loadMoreRecords = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    loadAllRecords(page + 1);
  }, [hasMore, isLoadingMore, page, loadAllRecords]);

  // Delete handlers
  const handleDeleteIntake = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteMutation.mutateAsync(id);
        setRecords((prev) => prev.filter((r) => getRecordId(r) !== id));
        toast({ title: "Entry deleted", description: "The intake record has been removed" });
      } catch {
        toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [toast, deleteMutation]
  );

  const handleDeleteWeight = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteWeightRecord(id);
        setRecords((prev) => prev.filter((r) => getRecordId(r) !== id));
        toast({ title: "Entry deleted", description: "The weight record has been removed" });
      } catch {
        toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [toast]
  );

  const handleDeleteBP = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteBloodPressureRecord(id);
        setRecords((prev) => prev.filter((r) => getRecordId(r) !== id));
        toast({ title: "Entry deleted", description: "The blood pressure record has been removed" });
      } catch {
        toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [toast]
  );

  const handleDeleteEating = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteEatingMutation.mutateAsync(id);
        setRecords((prev) => prev.filter((r) => getRecordId(r) !== id));
        toast({ title: "Entry deleted", description: "Eating record removed" });
      } catch {
        toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [toast, deleteEatingMutation]
  );

  const handleDeleteUrination = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteUrinationMutation.mutateAsync(id);
        setRecords((prev) => prev.filter((r) => getRecordId(r) !== id));
        toast({ title: "Entry deleted", description: "Urination record removed" });
      } catch {
        toast({ title: "Error", description: "Could not delete the entry", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [toast, deleteUrinationMutation]
  );

  // Edit handlers
  const openEditIntake = useCallback((record: IntakeRecord) => {
    setEditingIntake(record);
    setEditAmount(record.amount.toString());
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
    setEditNote(record.note || "");
  }, []);

  const openEditWeight = useCallback((record: WeightRecord) => {
    setEditingWeight(record);
    setEditWeight(record.weight.toString());
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
    setEditNote(record.note || "");
  }, []);

  const openEditBP = useCallback((record: BloodPressureRecord) => {
    setEditingBP(record);
    setEditSystolic(record.systolic.toString());
    setEditDiastolic(record.diastolic.toString());
    setEditHeartRate(record.heartRate?.toString() || "");
    setEditPosition(record.position);
    setEditArm(record.arm);
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
    setEditNote(record.note || "");
  }, []);

  const openEditEating = useCallback((record: EatingRecord) => {
    setEditingEating(record);
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
    setEditNote(record.note || "");
  }, []);

  const openEditUrination = useCallback((record: UrinationRecord) => {
    setEditingUrination(record);
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
    setEditAmountUrination(record.amountEstimate || "");
    setEditNote(record.note || "");
  }, []);

  // Submit edit handlers
  const handleEditIntakeSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingIntake) return;

      const newAmount = parseInt(editAmount, 10);
      const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
      const newNote = editNote.trim() || undefined;

      if (isNaN(newAmount) || newAmount <= 0) {
        toast({ title: "Invalid amount", description: "Please enter a valid positive number", variant: "destructive" });
        return;
      }

      if (isNaN(newTimestamp)) {
        toast({ title: "Invalid date/time", description: "Please enter a valid date and time", variant: "destructive" });
        return;
      }

      const recordToUpdate = editingIntake;

      try {
        await updateMutation.mutateAsync({
          id: recordToUpdate.id,
          updates: { amount: newAmount, timestamp: newTimestamp, note: newNote },
        });

        // Only clear state after successful mutation
        setEditingIntake(null);

        setRecords((prev) => {
          const updated = prev.map((r) =>
            r.type === "intake" && r.record.id === recordToUpdate.id
              ? { ...r, record: { ...r.record, amount: newAmount, timestamp: newTimestamp, note: newNote } }
              : r
          );
          return updated.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
        });

        toast({ title: "Entry updated", description: "The intake record has been updated" });
      } catch (error) {
        console.error("Failed to update intake record:", error);
        toast({ title: "Error", description: "Could not update the entry. Please try again.", variant: "destructive" });
        // Dialog stays open so user can retry
      }
    },
    [editingIntake, editAmount, editTimestamp, editNote, toast, updateMutation]
  );

  const handleEditWeightSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingWeight) return;

      const newWeight = parseFloat(editWeight);
      const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);

      if (isNaN(newWeight) || newWeight <= 0) {
        toast({ title: "Invalid weight", description: "Please enter a valid positive number", variant: "destructive" });
        return;
      }

      if (isNaN(newTimestamp)) {
        toast({ title: "Invalid date/time", description: "Please enter a valid date and time", variant: "destructive" });
        return;
      }

      const recordToUpdate = editingWeight;

      try {
        await updateWeightMutation.mutateAsync({
          id: recordToUpdate.id,
          updates: {
            weight: newWeight,
            timestamp: newTimestamp,
            note: editNote || undefined,
          },
        });

        // Only clear state after successful mutation
        setEditingWeight(null);

        setRecords((prev) => {
          const updated = prev.map((r) =>
            r.type === "weight" && r.record.id === recordToUpdate.id
              ? { ...r, record: { ...r.record, weight: newWeight, timestamp: newTimestamp, note: editNote || undefined } }
              : r
          );
          return updated.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
        });

        toast({ title: "Entry updated", description: "The weight record has been updated" });
      } catch (error) {
        console.error("Failed to update weight record:", error);
        toast({ title: "Error", description: "Could not update the entry. Please try again.", variant: "destructive" });
        // Dialog stays open so user can retry
      }
    },
    [editingWeight, editWeight, editTimestamp, editNote, toast, updateWeightMutation]
  );

  const handleEditBPSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingBP) return;

      const newSystolic = parseInt(editSystolic, 10);
      const newDiastolic = parseInt(editDiastolic, 10);
      const newHeartRate = editHeartRate ? parseInt(editHeartRate, 10) : undefined;
      const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);

      if (isNaN(newSystolic) || isNaN(newDiastolic) || newSystolic <= 0 || newDiastolic <= 0) {
        toast({ title: "Invalid values", description: "Please enter valid blood pressure readings", variant: "destructive" });
        return;
      }

      if (isNaN(newTimestamp)) {
        toast({ title: "Invalid date/time", description: "Please enter a valid date and time", variant: "destructive" });
        return;
      }

      const recordToUpdate = editingBP;

      try {
        await updateBPMutation.mutateAsync({
          id: recordToUpdate.id,
          updates: {
            systolic: newSystolic,
            diastolic: newDiastolic,
            heartRate: newHeartRate,
            position: editPosition,
            arm: editArm,
            timestamp: newTimestamp,
            note: editNote || undefined,
          },
        });

        // Only clear state after successful mutation
        setEditingBP(null);

        setRecords((prev) => {
          const updated = prev.map((r) =>
            r.type === "bp" && r.record.id === recordToUpdate.id
              ? {
                  ...r,
                  record: {
                    ...r.record,
                    systolic: newSystolic,
                    diastolic: newDiastolic,
                    heartRate: newHeartRate,
                    position: editPosition,
                    arm: editArm,
                    timestamp: newTimestamp,
                    note: editNote || undefined,
                  },
                }
              : r
          );
          return updated.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
        });

        toast({ title: "Entry updated", description: "The blood pressure record has been updated" });
      } catch (error) {
        console.error("Failed to update blood pressure record:", error);
        toast({ title: "Error", description: "Could not update the entry. Please try again.", variant: "destructive" });
        // Dialog stays open so user can retry
      }
    },
    [editingBP, editSystolic, editDiastolic, editHeartRate, editPosition, editArm, editTimestamp, editNote, toast, updateBPMutation]
  );

  const handleEditEatingSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingEating) return;
      const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
      if (isNaN(newTimestamp)) {
        toast({ title: "Invalid date/time", variant: "destructive" });
        return;
      }
      const recordToUpdate = editingEating;
      try {
        await updateEatingMutation.mutateAsync({
          id: recordToUpdate.id,
          updates: { timestamp: newTimestamp, note: editNote.trim() || undefined },
        });
        setEditingEating(null);
        setRecords((prev) =>
          prev
            .map((r) =>
              r.type === "eating" && r.record.id === recordToUpdate.id
                ? { ...r, record: { ...r.record, timestamp: newTimestamp, note: editNote.trim() || undefined } }
                : r
            )
            .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))
        );
        toast({ title: "Entry updated", description: "Eating record updated" });
      } catch {
        toast({ title: "Error", description: "Could not update", variant: "destructive" });
      }
    },
    [editingEating, editTimestamp, editNote, toast, updateEatingMutation]
  );

  const handleEditUrinationSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUrination) return;
      const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
      if (isNaN(newTimestamp)) {
        toast({ title: "Invalid date/time", variant: "destructive" });
        return;
      }
      const recordToUpdate = editingUrination;
      try {
        await updateUrinationMutation.mutateAsync({
          id: recordToUpdate.id,
          updates: {
            timestamp: newTimestamp,
            amountEstimate: editAmountUrination || undefined,
            note: editNote.trim() || undefined,
          },
        });
        setEditingUrination(null);
        setRecords((prev) =>
          prev
            .map((r) =>
              r.type === "urination" && r.record.id === recordToUpdate.id
                ? {
                    ...r,
                    record: {
                      ...r.record,
                      timestamp: newTimestamp,
                      amountEstimate: editAmountUrination || undefined,
                      note: editNote.trim() || undefined,
                    },
                  }
                : r
            )
            .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))
        );
        toast({ title: "Entry updated", description: "Urination record updated" });
      } catch {
        toast({ title: "Error", description: "Could not update", variant: "destructive" });
      }
    },
    [editingUrination, editTimestamp, editAmountUrination, editNote, toast, updateUrinationMutation]
  );

  // Filter records
  const filteredRecords = records.filter((r) => {
    if (filter === "all") return true;
    if (filter === "water") return r.type === "intake" && r.record.type === "water";
    if (filter === "salt") return r.type === "intake" && r.record.type === "salt";
    if (filter === "weight") return r.type === "weight";
    if (filter === "bp") return r.type === "bp";
    if (filter === "eating") return r.type === "eating";
    if (filter === "urination") return r.type === "urination";
    return true;
  });

  const groupedRecords = groupRecordsByDate(filteredRecords);
  const dateGroups = Array.from(groupedRecords.entries());

  return (
    <>
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        <DrawerContent direction="bottom" className="h-[96vh] flex flex-col">
          {/* Fixed Header */}
          <DrawerHeader className="border-b shrink-0">
            <DrawerTitle>Health History</DrawerTitle>
            <DrawerDescription>View and manage all your logged entries</DrawerDescription>
            
            {/* Filter Tabs */}
            <div className="flex gap-1 pt-2 overflow-x-auto">
              {(["all", "water", "salt", "weight", "bp", "eating", "urination"] as FilterType[]).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "text-xs shrink-0",
                    filter === f && f === "water" && "bg-sky-600 hover:bg-sky-700",
                    filter === f && f === "salt" && "bg-amber-600 hover:bg-amber-700",
                    filter === f && f === "weight" && "bg-emerald-600 hover:bg-emerald-700",
                    filter === f && f === "bp" && "bg-rose-600 hover:bg-rose-700",
                    filter === f && f === "eating" && "bg-orange-600 hover:bg-orange-700",
                    filter === f && f === "urination" && "bg-violet-600 hover:bg-violet-700"
                  )}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" && "All"}
                  {f === "water" && "Water"}
                  {f === "salt" && "Salt"}
                  {f === "weight" && "Weight"}
                  {f === "bp" && "BP"}
                  {f === "eating" && "Eating"}
                  {f === "urination" && "Urination"}
                </Button>
              ))}
            </div>
          </DrawerHeader>

          {/* Scrollable Content */}
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
                      {dayRecords.map((unified) => {
                        const onDelete =
                          unified.type === "intake"
                            ? () => handleDeleteIntake(unified.record.id)
                            : unified.type === "weight"
                              ? () => handleDeleteWeight(unified.record.id)
                              : unified.type === "bp"
                                ? () => handleDeleteBP(unified.record.id)
                                : unified.type === "eating"
                                  ? () => handleDeleteEating(unified.record.id)
                                  : () => handleDeleteUrination(unified.record.id);

                        const onEdit =
                          unified.type === "intake"
                            ? () => openEditIntake(unified.record as IntakeRecord)
                            : unified.type === "weight"
                              ? () => openEditWeight(unified.record as WeightRecord)
                              : unified.type === "bp"
                                ? () => openEditBP(unified.record as BloodPressureRecord)
                                : unified.type === "eating"
                                  ? () => openEditEating(unified.record as EatingRecord)
                                  : () => openEditUrination(unified.record as UrinationRecord);

                        return (
                          <RecordRow
                            key={unified.record.id}
                            unified={unified}
                            onDelete={onDelete}
                            onEdit={onEdit}
                            isDeleting={deletingId === unified.record.id}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Load more button */}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={loadMoreRecords} disabled={isLoadingMore} className="gap-2">
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Load More
                        </>
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
    </>
  );
}
