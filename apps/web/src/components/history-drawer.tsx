"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { EditBloodPressureDialog } from "@/components/edit-blood-pressure-dialog";
import { EditEatingDialog } from "@/components/edit-eating-dialog";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
import { EditDefecationDialog } from "@/components/edit-defecation-dialog";
import { RecordRow } from "@/components/history/record-row";
import { useSettings } from "@/hooks/use-settings";
import { History, Loader2, ChevronDown, Calendar } from "lucide-react";
import {
  type UnifiedRecord,
  type FilterType,
  getRecordTimestamp,
  getRecordId,
  groupRecordsByDate,
  filterRecords,
} from "@/lib/history-types";
import { CARD_THEMES } from "@/lib/card-themes";
import { useDeleteIntake } from "@/hooks/use-intake-queries";
import { useHistoryData } from "@/hooks/use-history-queries";
import { useDeleteEating } from "@/hooks/use-eating-queries";
import { useDeleteUrination } from "@/hooks/use-urination-queries";
import { useDeleteDefecation } from "@/hooks/use-defecation-queries";
import { useToast } from "@intake/ui/use-toast";
import { useKeyboardAwareScroll } from "@/hooks/use-keyboard-scroll";
import { cn } from "@/lib/utils";
import {
  type EditableType,
  type EditingState,
  type FieldMap,
  initEditingState,
  useRecordAdapters,
  ValidationError,
} from "@/hooks/use-record-adapters";

const PAGE_SIZE = 30;

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HistoryDrawer({ open, onOpenChange }: HistoryDrawerProps) {
  const { toast } = useToast();
  const { onFocus: scrollOnFocus } = useKeyboardAwareScroll();
  const settings = useSettings();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  const {
    data: historyData,
    deleteWeight: historyDeleteWeight,
    deleteBP: historyDeleteBP,
  } = useHistoryData();

  const deleteIntakeMutation = useDeleteIntake();
  const deleteEatingMutation = useDeleteEating();
  const deleteUrinationMutation = useDeleteUrination();
  const deleteDefecationMutation = useDeleteDefecation();

  const adapters = useRecordAdapters();

  const [page, setPage] = useState(1);
  const [editingRecord, setEditingRecord] = useState<EditingState | null>(null);

  const allRecords = useMemo<UnifiedRecord[]>(() => {
    if (!open || !historyData) return [];
    const unified: UnifiedRecord[] = [
      ...historyData.intakeRecords.map((r) => ({ type: "intake" as const, record: r })),
      ...historyData.weightRecords.map((r) => ({ type: "weight" as const, record: r })),
      ...historyData.bpRecords.map((r) => ({ type: "bp" as const, record: r })),
      ...historyData.eatingRecords.map((r) => ({ type: "eating" as const, record: r })),
      ...historyData.urinationRecords.map((r) => ({ type: "urination" as const, record: r })),
      ...historyData.defecationRecords.map((r) => ({ type: "defecation" as const, record: r })),
    ];
    unified.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    return unified;
  }, [open, historyData]);

  const records = useMemo(
    () => allRecords.slice(0, page * PAGE_SIZE),
    [allRecords, page],
  );
  const hasMore = allRecords.length > page * PAGE_SIZE;
  const isLoading = open && !historyData;

  // Handle open change (PIN protection removed in phase 41)
  const handleOpenChange = useCallback((newOpen: boolean) => {
    onOpenChange(newOpen);
  }, [onOpenChange]);

  const loadMoreRecords = useCallback(() => {
    if (!hasMore) return;
    setPage((prev) => prev + 1);
  }, [hasMore]);

  const handleDelete = useCallback(
    async (unified: UnifiedRecord) => {
      const id = getRecordId(unified);
      setDeletingId(id);
      try {
        if (unified.type === "intake") await deleteIntakeMutation.mutateAsync(id);
        else if (unified.type === "weight") await historyDeleteWeight(id);
        else if (unified.type === "bp") await historyDeleteBP(id);
        else if (unified.type === "eating") await deleteEatingMutation.mutateAsync(id);
        else if (unified.type === "urination") await deleteUrinationMutation.mutateAsync(id);
        else if (unified.type === "defecation") await deleteDefecationMutation.mutateAsync(id);
        toast({ title: "Entry deleted", description: "Record removed" });
      } catch {
        toast({
          title: "Error",
          description: "Could not delete the entry",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [
      toast,
      deleteIntakeMutation,
      historyDeleteWeight,
      historyDeleteBP,
      deleteEatingMutation,
      deleteUrinationMutation,
      deleteDefecationMutation,
    ],
  );

  const openEdit = useCallback((unified: UnifiedRecord) => {
    if (unified.type === "caffeine" || unified.type === "alcohol") return;
    setEditingRecord(initEditingState(unified.type, unified.record));
  }, []);

  const closeEdit = useCallback(() => setEditingRecord(null), []);

  const patchFields = useCallback(<K extends EditableType>(patch: Partial<FieldMap[K]>) => {
    setEditingRecord((current) => {
      if (!current) return null;
      return {
        ...current,
        fields: { ...current.fields, ...patch },
      } as EditingState;
    });
  }, []);

  const handleEditSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingRecord) return;
      const adapter = adapters[editingRecord.type] as {
        submit: (id: string, fields: FieldMap[EditableType]) => Promise<void>;
      };
      try {
        await adapter.submit(editingRecord.record.id, editingRecord.fields);
        setEditingRecord(null);
        toast({ title: "Entry updated" });
      } catch (err) {
        if (err instanceof ValidationError) {
          toast({ title: err.message, variant: "destructive" });
          return;
        }
        toast({
          title: "Error",
          description: "Could not update the entry",
          variant: "destructive",
        });
      }
    },
    [adapters, editingRecord, toast],
  );

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

  const intakeEdit = editingRecord?.type === "intake" ? editingRecord : null;
  const weightEdit = editingRecord?.type === "weight" ? editingRecord : null;
  const bpEdit = editingRecord?.type === "bp" ? editingRecord : null;
  const eatingEdit = editingRecord?.type === "eating" ? editingRecord : null;
  const urinationEdit = editingRecord?.type === "urination" ? editingRecord : null;
  const defecationEdit = editingRecord?.type === "defecation" ? editingRecord : null;

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
                          liquidPresets={settings.liquidPresets}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={loadMoreRecords} className="gap-2">
                      <ChevronDown className="w-4 h-4" />Load More
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
        record={intakeEdit?.record ?? null}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        amount={intakeEdit?.fields.amount ?? ""}
        onAmountChange={(v) => patchFields<"intake">({ amount: v })}
        timestamp={intakeEdit?.fields.timestamp ?? ""}
        onTimestampChange={(v) => patchFields<"intake">({ timestamp: v })}
        note={intakeEdit?.fields.note ?? ""}
        onNoteChange={(v) => patchFields<"intake">({ note: v })}
        onFocus={scrollOnFocus}
      />
      <EditWeightDialog
        record={weightEdit?.record ?? null}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        weight={weightEdit?.fields.weight ?? ""}
        onWeightChange={(v) => patchFields<"weight">({ weight: v })}
        timestamp={weightEdit?.fields.timestamp ?? ""}
        onTimestampChange={(v) => patchFields<"weight">({ timestamp: v })}
        note={weightEdit?.fields.note ?? ""}
        onNoteChange={(v) => patchFields<"weight">({ note: v })}
        onFocus={scrollOnFocus}
      />
      <EditBloodPressureDialog
        record={bpEdit?.record ?? null}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        systolic={bpEdit?.fields.systolic ?? ""}
        onSystolicChange={(v) => patchFields<"bp">({ systolic: v })}
        diastolic={bpEdit?.fields.diastolic ?? ""}
        onDiastolicChange={(v) => patchFields<"bp">({ diastolic: v })}
        heartRate={bpEdit?.fields.heartRate ?? ""}
        onHeartRateChange={(v) => patchFields<"bp">({ heartRate: v })}
        position={bpEdit?.fields.position ?? "sitting"}
        onPositionChange={(v) => patchFields<"bp">({ position: v })}
        arm={bpEdit?.fields.arm ?? "left"}
        onArmChange={(v) => patchFields<"bp">({ arm: v })}
        timestamp={bpEdit?.fields.timestamp ?? ""}
        onTimestampChange={(v) => patchFields<"bp">({ timestamp: v })}
        note={bpEdit?.fields.note ?? ""}
        onNoteChange={(v) => patchFields<"bp">({ note: v })}
        onFocus={scrollOnFocus}
      />
      <EditEatingDialog
        record={eatingEdit?.record ?? null}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        timestamp={eatingEdit?.fields.timestamp ?? ""}
        onTimestampChange={(v) => patchFields<"eating">({ timestamp: v })}
        note={eatingEdit?.fields.note ?? ""}
        onNoteChange={(v) => patchFields<"eating">({ note: v })}
        onFocus={scrollOnFocus}
      />
      <EditUrinationDialog
        record={urinationEdit?.record ?? null}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        timestamp={urinationEdit?.fields.timestamp ?? ""}
        onTimestampChange={(v) => patchFields<"urination">({ timestamp: v })}
        amount={urinationEdit?.fields.amount ?? ""}
        onAmountChange={(v) => patchFields<"urination">({ amount: v })}
        note={urinationEdit?.fields.note ?? ""}
        onNoteChange={(v) => patchFields<"urination">({ note: v })}
        onFocus={scrollOnFocus}
      />
      <EditDefecationDialog
        record={defecationEdit?.record ?? null}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        timestamp={defecationEdit?.fields.timestamp ?? ""}
        onTimestampChange={(v) => patchFields<"defecation">({ timestamp: v })}
        amount={defecationEdit?.fields.amount ?? ""}
        onAmountChange={(v) => patchFields<"defecation">({ amount: v })}
        note={defecationEdit?.fields.note ?? ""}
        onNoteChange={(v) => patchFields<"defecation">({ note: v })}
        onFocus={scrollOnFocus}
      />
    </>
  );
}
