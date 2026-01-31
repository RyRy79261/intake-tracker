"use client";

import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  History,
  Droplets,
  Sparkles,
  Trash2,
  Calendar,
  Clock,
  Loader2,
  Lock,
  ChevronDown,
  Pencil,
  Scale,
  Heart,
} from "lucide-react";
import { type IntakeRecord, type WeightRecord, type BloodPressureRecord, db } from "@/lib/db";
import { getRecordsByCursor } from "@/lib/intake-service";
import { getWeightRecords, deleteWeightRecord, getBloodPressureRecords, deleteBloodPressureRecord } from "@/lib/health-service";
import { useUpdateIntake, useDeleteIntake } from "@/hooks/use-intake-queries";
import { useToast } from "@/hooks/use-toast";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { cn } from "@/lib/utils";

// Unified record type for display
type UnifiedRecord =
  | { type: "intake"; record: IntakeRecord }
  | { type: "weight"; record: WeightRecord }
  | { type: "bp"; record: BloodPressureRecord };

type FilterType = "all" | "water" | "salt" | "weight" | "bp";

// Helper to convert timestamp to datetime-local format
function timestampToDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

// Helper to convert datetime-local value to timestamp
function dateTimeLocalToTimestamp(value: string): number {
  return new Date(value).getTime();
}

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

// Format time from timestamp
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Format source for display
function formatSource(source?: string): string {
  if (!source) return "Manual";
  if (source === "manual") return "Manual";
  if (source === "voice") return "Voice";
  if (source.startsWith("food:")) {
    const food = source.replace("food:", "");
    return `Food: ${food}`;
  }
  return source;
}

// BP category helper
function getBPCategory(systolic: number, diastolic: number) {
  if (systolic < 120 && diastolic < 80) return { label: "Normal", color: "text-green-600 dark:text-green-400" };
  if (systolic < 130 && diastolic < 80) return { label: "Elevated", color: "text-yellow-600 dark:text-yellow-400" };
  if (systolic < 140 || diastolic < 90) return { label: "High Stage 1", color: "text-orange-600 dark:text-orange-400" };
  if (systolic >= 140 || diastolic >= 90) return { label: "High Stage 2", color: "text-red-600 dark:text-red-400" };
  return { label: "Unknown", color: "text-muted-foreground" };
}

// Intake Record Item
function IntakeRecordItem({
  record,
  onDelete,
  onEdit,
  isDeleting,
}: {
  record: IntakeRecord;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
}) {
  const isWater = record.type === "water";
  const unit = isWater ? "ml" : "mg";

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border",
        isWater
          ? "bg-sky-50/50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-800"
          : "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "p-2 rounded-full",
            isWater ? "bg-sky-100 dark:bg-sky-900/50" : "bg-amber-100 dark:bg-amber-900/50"
          )}
        >
          {isWater ? (
            <Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div>
          <div className="font-medium">
            {record.amount} {unit}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {formatTime(record.timestamp)}
            <span className="text-muted-foreground/50">•</span>
            {formatSource(record.source)}
            {record.note && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="truncate max-w-[100px]">{record.note}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={onEdit}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// Weight Record Item
function WeightRecordItem({
  record,
  onDelete,
  onEdit,
  isDeleting,
}: {
  record: WeightRecord;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50">
          <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <div className="font-medium">{record.weight} kg</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {formatTime(record.timestamp)}
            {record.note && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="truncate max-w-[100px]">{record.note}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={onEdit}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// Blood Pressure Record Item
function BPRecordItem({
  record,
  onDelete,
  onEdit,
  isDeleting,
}: {
  record: BloodPressureRecord;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
}) {
  const category = getBPCategory(record.systolic, record.diastolic);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-900/50">
          <Heart className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <div className="font-medium">
            {record.systolic}/{record.diastolic} mmHg
            {record.heartRate && <span className="text-sm text-muted-foreground ml-2">{record.heartRate} BPM</span>}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {formatTime(record.timestamp)}
            <span className="text-muted-foreground/50">•</span>
            <span className={category.color}>{category.label}</span>
            <span className="text-muted-foreground/50">•</span>
            {record.position}, {record.arm} arm
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={onEdit}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

export function HistorySheet() {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { requirePin, showLockedUI } = usePinProtected();
  const [filter, setFilter] = useState<FilterType>("all");

  // Mutations
  const updateMutation = useUpdateIntake();
  const deleteMutation = useDeleteIntake();

  // Unified records state
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  // Edit dialog states
  const [editingIntake, setEditingIntake] = useState<IntakeRecord | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightRecord | null>(null);
  const [editingBP, setEditingBP] = useState<BloodPressureRecord | null>(null);

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
      
      // Fetch all record types - each with its own error handling
      let intakeRecords: IntakeRecord[] = [];
      let weightRecordsData: WeightRecord[] = [];
      let bpRecordsData: BloodPressureRecord[] = [];

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

      // Convert to unified records
      const unified: UnifiedRecord[] = [
        ...intakeRecords.map((r) => ({ type: "intake" as const, record: r })),
        ...weightRecordsData.map((r) => ({ type: "weight" as const, record: r })),
        ...bpRecordsData.map((r) => ({ type: "bp" as const, record: r })),
      ];

      // Sort by timestamp descending
      unified.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

      // Paginate
      const start = (pageNum - 1) * pageSize;
      const end = start + pageSize;
      const paginatedRecords = unified.slice(0, end);

      setRecords(paginatedRecords);
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

      const recordToUpdate = editingIntake;
      setEditingIntake(null);

      try {
        await updateMutation.mutateAsync({
          id: recordToUpdate.id,
          updates: { amount: newAmount, timestamp: newTimestamp, note: newNote },
        });

        setRecords((prev) => {
          const updated = prev.map((r) =>
            r.type === "intake" && r.record.id === recordToUpdate.id
              ? { ...r, record: { ...r.record, amount: newAmount, timestamp: newTimestamp, note: newNote } }
              : r
          );
          return updated.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
        });

        toast({ title: "Entry updated", description: "The intake record has been updated" });
      } catch {
        toast({ title: "Error", description: "Could not update the entry", variant: "destructive" });
      }
    },
    [editingIntake, editAmount, editTimestamp, toast, updateMutation]
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

      const recordToUpdate = editingWeight;
      setEditingWeight(null);

      try {
        await db.weightRecords.update(recordToUpdate.id, {
          weight: newWeight,
          timestamp: newTimestamp,
          note: editNote || undefined,
        });

        setRecords((prev) => {
          const updated = prev.map((r) =>
            r.type === "weight" && r.record.id === recordToUpdate.id
              ? { ...r, record: { ...r.record, weight: newWeight, timestamp: newTimestamp, note: editNote || undefined } }
              : r
          );
          return updated.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
        });

        toast({ title: "Entry updated", description: "The weight record has been updated" });
      } catch {
        toast({ title: "Error", description: "Could not update the entry", variant: "destructive" });
      }
    },
    [editingWeight, editWeight, editTimestamp, editNote, toast]
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

      const recordToUpdate = editingBP;
      setEditingBP(null);

      try {
        await db.bloodPressureRecords.update(recordToUpdate.id, {
          systolic: newSystolic,
          diastolic: newDiastolic,
          heartRate: newHeartRate,
          position: editPosition,
          arm: editArm,
          timestamp: newTimestamp,
          note: editNote || undefined,
        });

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
      } catch {
        toast({ title: "Error", description: "Could not update the entry", variant: "destructive" });
      }
    },
    [editingBP, editSystolic, editDiastolic, editHeartRate, editPosition, editArm, editTimestamp, editNote, toast]
  );

  // Handle sheet open with PIN check
  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        const unlocked = await requirePin();
        if (unlocked) {
          setIsOpen(true);
          setRecords([]);
          setPage(1);
          setHasMore(true);
          loadAllRecords(1);
        }
      } else {
        setIsOpen(false);
      }
    },
    [requirePin, loadAllRecords]
  );

  // Filter records
  const filteredRecords = records.filter((r) => {
    if (filter === "all") return true;
    if (filter === "water") return r.type === "intake" && r.record.type === "water";
    if (filter === "salt") return r.type === "intake" && r.record.type === "salt";
    if (filter === "weight") return r.type === "weight";
    if (filter === "bp") return r.type === "bp";
    return true;
  });

  const groupedRecords = groupRecordsByDate(filteredRecords);
  const dateGroups = Array.from(groupedRecords.entries());

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 relative">
            <History className="w-5 h-5" />
            {showLockedUI && <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-amber-500" />}
            <span className="sr-only">History</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Health History</SheetTitle>
            <SheetDescription>View and manage all your logged entries</SheetDescription>
          </SheetHeader>

          {/* Filter Tabs */}
          <div className="flex gap-1 py-4 overflow-x-auto">
            {(["all", "water", "salt", "weight", "bp"] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs shrink-0",
                  filter === f && f === "water" && "bg-sky-600 hover:bg-sky-700",
                  filter === f && f === "salt" && "bg-amber-600 hover:bg-amber-700",
                  filter === f && f === "weight" && "bg-emerald-600 hover:bg-emerald-700",
                  filter === f && f === "bp" && "bg-rose-600 hover:bg-rose-700"
                )}
                onClick={() => setFilter(f)}
              >
                {f === "all" && "All"}
                {f === "water" && "Water"}
                {f === "salt" && "Salt"}
                {f === "weight" && "Weight"}
                {f === "bp" && "BP"}
              </Button>
            ))}
          </div>

          <div className="pb-6">
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
                    <div className="space-y-2">
                      {dayRecords.map((unified) => {
                        if (unified.type === "intake") {
                          return (
                            <IntakeRecordItem
                              key={unified.record.id}
                              record={unified.record}
                              onDelete={() => handleDeleteIntake(unified.record.id)}
                              onEdit={() => openEditIntake(unified.record)}
                              isDeleting={deletingId === unified.record.id}
                            />
                          );
                        }
                        if (unified.type === "weight") {
                          return (
                            <WeightRecordItem
                              key={unified.record.id}
                              record={unified.record}
                              onDelete={() => handleDeleteWeight(unified.record.id)}
                              onEdit={() => openEditWeight(unified.record)}
                              isDeleting={deletingId === unified.record.id}
                            />
                          );
                        }
                        if (unified.type === "bp") {
                          return (
                            <BPRecordItem
                              key={unified.record.id}
                              record={unified.record}
                              onDelete={() => handleDeleteBP(unified.record.id)}
                              onEdit={() => openEditBP(unified.record)}
                              isDeleting={deletingId === unified.record.id}
                            />
                          );
                        }
                        return null;
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
        </SheetContent>
      </Sheet>

      {/* Edit Intake Dialog */}
      <Dialog open={editingIntake !== null} onOpenChange={(open) => !open && setEditingIntake(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingIntake?.type === "water" ? "Water" : "Salt"} Entry</DialogTitle>
            <DialogDescription>Update the amount, time, or note for this entry</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditIntakeSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount ({editingIntake?.type === "water" ? "ml" : "mg"})</Label>
              <Input
                id="edit-amount"
                type="number"
                min="1"
                step="1"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="text-lg h-12"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-timestamp">Time</Label>
              <Input
                id="edit-timestamp"
                type="datetime-local"
                value={editTimestamp}
                onChange={(e) => setEditTimestamp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-intake-note">Note (optional)</Label>
              <Input
                id="edit-intake-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Add a note..."
                maxLength={200}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingIntake(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={cn(
                  editingIntake?.type === "water" ? "bg-sky-600 hover:bg-sky-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Weight Dialog */}
      <Dialog open={editingWeight !== null} onOpenChange={(open) => !open && setEditingWeight(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Weight Entry</DialogTitle>
            <DialogDescription>Update the weight, time, or note</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditWeightSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-weight">Weight (kg)</Label>
              <Input
                id="edit-weight"
                type="number"
                min="0.1"
                step="0.1"
                value={editWeight}
                onChange={(e) => setEditWeight(e.target.value)}
                className="text-lg h-12"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-weight-timestamp">Time</Label>
              <Input
                id="edit-weight-timestamp"
                type="datetime-local"
                value={editTimestamp}
                onChange={(e) => setEditTimestamp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-weight-note">Note (optional)</Label>
              <Input
                id="edit-weight-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Add a note..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingWeight(null)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit BP Dialog */}
      <Dialog open={editingBP !== null} onOpenChange={(open) => !open && setEditingBP(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Blood Pressure Entry</DialogTitle>
            <DialogDescription>Update the blood pressure readings</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditBPSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-systolic">Systolic</Label>
                <Input
                  id="edit-systolic"
                  type="number"
                  min="60"
                  max="300"
                  value={editSystolic}
                  onChange={(e) => setEditSystolic(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-diastolic">Diastolic</Label>
                <Input
                  id="edit-diastolic"
                  type="number"
                  min="40"
                  max="200"
                  value={editDiastolic}
                  onChange={(e) => setEditDiastolic(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-heartrate">Heart Rate (optional)</Label>
              <Input
                id="edit-heartrate"
                type="number"
                min="30"
                max="250"
                value={editHeartRate}
                onChange={(e) => setEditHeartRate(e.target.value)}
                placeholder="BPM"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Position</Label>
                <Select value={editPosition} onValueChange={(v) => setEditPosition(v as "sitting" | "standing")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sitting">Sitting</SelectItem>
                    <SelectItem value="standing">Standing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Arm</Label>
                <Select value={editArm} onValueChange={(v) => setEditArm(v as "left" | "right")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bp-timestamp">Time</Label>
              <Input
                id="edit-bp-timestamp"
                type="datetime-local"
                value={editTimestamp}
                onChange={(e) => setEditTimestamp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bp-note">Note (optional)</Label>
              <Input
                id="edit-bp-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Add a note..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingBP(null)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
