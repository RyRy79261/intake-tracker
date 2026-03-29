"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditEatingDialog } from "@/components/edit-eating-dialog";
import {
  ComposablePreview,
  type PreviewRecord,
} from "@/components/food-salt/composable-preview";
import { parseIntakeWithAI } from "@/lib/ai-client";
import { useAddComposableEntry, type ComposableEntryInput } from "@/hooks/use-composable-entry";
import {
  useEatingRecords,
  useAddEating,
  useDeleteEating,
  useUpdateEating,
} from "@/hooks/use-eating-queries";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@/hooks/use-toast";
import { type EatingRecord } from "@/lib/db";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

const theme = CARD_THEMES.eating;

// ─── Helper: build ComposableEntryInput from preview records ─────────

function buildComposableInput(
  records: PreviewRecord[],
  originalText: string
): ComposableEntryInput {
  const eating = records.find((r) => r.type === "eating");
  const water = records.find((r) => r.type === "water");
  const salt = records.find((r) => r.type === "salt");
  const intakes: ComposableEntryInput["intakes"] = [];

  if (water && water.amountMl && water.amountMl > 0) {
    intakes.push({
      type: "water",
      amount: water.amountMl,
      source: "food:ai_parse",
    });
  }
  if (salt && salt.amountMg && salt.amountMg > 0) {
    intakes.push({
      type: "salt",
      amount: salt.amountMg,
      source: "food:ai_parse",
    });
  }

  return {
    ...(eating && {
      eating: {
        ...(eating.description !== undefined && { note: eating.description }),
        ...(eating.grams !== undefined &&
          eating.grams > 0 && { grams: eating.grams }),
      },
    }),
    ...(intakes.length > 0 && { intakes }),
    originalInputText: originalText,
    groupSource: "ai_food_parse",
  };
}

export function FoodSection() {
  const { toast } = useToast();
  const addComposableEntry = useAddComposableEntry();

  // ─── Quick log state ──────────────────────────────────────────────
  const addEatingMutation = useAddEating();

  // ─── Add details state ────────────────────────────────────────────
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailNote, setDetailNote] = useState("");
  const [detailGrams, setDetailGrams] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());

  // ─── AI food input state ──────────────────────────────────────────
  const [foodText, setFoodText] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  // ─── Composable preview state ─────────────────────────────────────
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [originalInputText, setOriginalInputText] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  // ─── Recent eating records ────────────────────────────────────────
  const recentRecords = useEatingRecords(5);
  const deleteMutation = useDeleteEating();
  const updateMutation = useUpdateEating();
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Eating record removed"
  );

  // Extra edit field for grams
  const [editGrams, setEditGrams] = useState("");

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<EatingRecord>({
    onOpen: (record) => setEditGrams(record.grams?.toString() || ""),
    buildUpdates: (timestamp, note) => {
      const g = editGrams ? parseInt(editGrams, 10) : undefined;
      return { timestamp, note, grams: g && g > 0 ? g : undefined };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleDetailSubmit = useCallback(async () => {
    try {
      const timestamp = dateTimeLocalToTimestamp(detailTime);
      const grams = detailGrams ? parseInt(detailGrams, 10) : undefined;
      const note = detailNote || undefined;
      await addEatingMutation.mutateAsync({
        timestamp,
        ...(note !== undefined && { note }),
        ...(grams !== undefined && grams > 0 && { grams }),
      });
      toast({
        title: "Logged",
        description: detailNote
          ? "Meal with details recorded"
          : "Eating event recorded",
        variant: "success",
      });
      setDetailNote("");
      setDetailGrams("");
      setDetailTime(getCurrentDateTimeLocal());
      setDetailsOpen(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    }
  }, [addEatingMutation, detailNote, detailGrams, detailTime, toast]);

  const handleParse = useCallback(async () => {
    const trimmed = foodText.trim();
    if (!trimmed || isParsing) return;

    setIsParsing(true);
    // Collapse details when AI parse triggered (mutual exclusivity)
    setDetailsOpen(false);

    try {
      const result = await parseIntakeWithAI(trimmed);
      const records: PreviewRecord[] = [];

      // Always create an eating record from the food description
      records.push({
        type: "eating",
        description: trimmed,
        expanded: false,
      });

      if (result.water && result.water > 0) {
        records.push({
          type: "water",
          amountMl: result.water,
          expanded: false,
        });
      }

      if (result.salt && result.salt > 0) {
        records.push({
          type: "salt",
          amountMg: result.salt,
          expanded: false,
        });
      }

      setPreviewRecords(records);
      setReasoning(result.reasoning ?? null);
      setOriginalInputText(trimmed);
    } catch {
      toast({
        title: "AI parsing failed",
        description: "Try again or add details manually.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  }, [foodText, isParsing, toast]);

  const handleConfirmAll = useCallback(async () => {
    if (previewRecords.length === 0 || isConfirming) return;

    setIsConfirming(true);
    try {
      const input = buildComposableInput(previewRecords, originalInputText);
      await addComposableEntry(input);
      toast({
        title: "Food logged",
        description: `${previewRecords.length} linked records created`,
        variant: "success",
      });
      setPreviewRecords([]);
      setFoodText("");
      setReasoning(null);
      setOriginalInputText("");
    } catch {
      toast({
        title: "Error",
        description: "Failed to save food entry",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  }, [
    previewRecords,
    isConfirming,
    originalInputText,
    addComposableEntry,
    toast,
  ]);

  const handleTryAgain = useCallback(() => {
    setPreviewRecords([]);
    setFoodText("");
    setReasoning(null);
    setOriginalInputText("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleParse();
      }
    },
    [handleParse]
  );

  const showPreview = previewRecords.length > 0;

  return (
    <>
      {/* AI Food Input */}
      <div className="relative mt-3">
        <Input
          value={foodText}
          onChange={(e) => setFoodText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe food for AI parsing..."
          aria-label="Describe food for AI nutritional parsing"
          className="h-10 pr-10"
          disabled={isParsing}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={!foodText.trim() || isParsing}
          aria-label="Parse food with AI"
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors",
            "text-muted-foreground hover:text-orange-600 dark:hover:text-orange-400",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isParsing ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Composable Preview */}
      {showPreview && (
        <ComposablePreview
          records={previewRecords}
          onRecordsChange={setPreviewRecords}
          originalInputText={originalInputText}
          reasoning={reasoning}
          onConfirm={handleConfirmAll}
          onTryAgain={handleTryAgain}
          isConfirming={isConfirming}
        />
      )}

      {/* "Add details" Expandable — hidden when AI preview is visible */}
      {!showPreview && (
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground"
            >
              <span>Add details</span>
              {detailsOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="p-3 rounded-lg bg-muted/50 border space-y-3">
              <div className="space-y-1">
                <Label htmlFor="eating-note" className="text-sm">
                  What I ate (optional)
                </Label>
                <Textarea
                  id="eating-note"
                  placeholder="e.g. Sandwich, apple, water"
                  value={detailNote}
                  onChange={(e) => setDetailNote(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eating-grams" className="text-sm">
                  Weight in grams (optional)
                </Label>
                <Input
                  id="eating-grams"
                  type="number"
                  min="1"
                  max="10000"
                  placeholder="e.g. 250"
                  value={detailGrams}
                  onChange={(e) => setDetailGrams(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eating-time" className="text-sm">
                  When
                </Label>
                <Input
                  id="eating-time"
                  type="datetime-local"
                  value={detailTime}
                  onChange={(e) => setDetailTime(e.target.value)}
                  max={getCurrentDateTimeLocal()}
                />
              </div>
              <Button
                onClick={handleDetailSubmit}
                disabled={addEatingMutation.isPending}
                className={cn("w-full mt-2", theme.buttonBg)}
              >
                {addEatingMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Record with details"
                )}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Recent Eating Records */}
      <RecentEntriesList
        records={recentRecords}
        deletingId={deletingId}
        onDelete={handleDelete}
        onEdit={openEdit}
        borderColor={theme.border}
        renderEntry={(record) => (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">
              {formatDateTime(record.timestamp)}
            </span>
            {record.grams && (
              <span className="text-xs font-medium">{record.grams}g</span>
            )}
            {record.note && (
              <span className="text-xs text-muted-foreground/70 truncate">
                {record.note}
              </span>
            )}
          </div>
        )}
      />

      <EditEatingDialog
        record={editingRecord}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
        grams={editGrams}
        onGramsChange={setEditGrams}
      />
    </>
  );
}
