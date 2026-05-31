"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import { parseIntakeWithAI } from "@/lib/ai-client";
import { useAuthGate } from "@/components/auth-guard";
import {
  useAddComposableEntry,
  useSyncEatingGroup,
  fetchEntryGroup,
  sodiumKindFromSource,
  type ComposableEntryInput,
} from "@/hooks/use-composable-entry";
import {
  useEatingRecords,
  useAddEating,
  useDeleteEating,
} from "@/hooks/use-eating-queries";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import {
  useSaltTotalsByGroupIds,
  useSugarTotalsByGroupIds,
  usePotassiumTotalsByGroupIds,
} from "@/hooks/use-intake-queries";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@/hooks/use-toast";
import { type EatingRecord } from "@/lib/db";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";

const theme = CARD_THEMES.eating;

// ─── Sodium conversion multipliers ─────────────────────────────────

type SodiumSource = "sodium" | "salt" | "msg";

const SODIUM_MULTIPLIERS: Record<SodiumSource, number> = {
  sodium: 1.0, // direct sodium mg
  salt: 0.39, // table salt is ~39% sodium
  msg: 0.12, // MSG is ~12% sodium
};

export function FoodSection() {
  const { toast } = useToast();
  const showAi = useAuthGate();
  const addComposableEntry = useAddComposableEntry();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");

  // ─── Mutations ────────────────────────────────────────────────────
  const addEatingMutation = useAddEating();

  // ─── Form state ───────────────────────────────────────────────────
  const [foodText, setFoodText] = useState("");
  const [detailGrams, setDetailGrams] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [sodiumSource, setSodiumSource] = useState<SodiumSource>("sodium");
  const [sugarG, setSugarG] = useState("");
  const [potassiumMg, setPotassiumMg] = useState("");
  const [waterMl, setWaterMl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Track whether AI populated form fields (determines composable vs plain submit)
  const [aiPopulated, setAiPopulated] = useState(false);

  // ─── Derived sodium calculation ───────────────────────────────────
  const sodiumMgNum = sodiumMg ? parseFloat(sodiumMg) : 0;
  const calculatedSodiumMg =
    sodiumMgNum > 0
      ? Math.round(sodiumMgNum * SODIUM_MULTIPLIERS[sodiumSource])
      : 0;
  const hasSodium = calculatedSodiumMg > 0;

  // ─── Derived sugar calculation ────────────────────────────────────
  const sugarGNum = sugarG ? parseFloat(sugarG) : 0;
  const calculatedSugarG = sugarGNum > 0 ? Math.round(sugarGNum) : 0;

  // ─── Derived potassium calculation ────────────────────────────────
  const potassiumMgNum = potassiumMg ? parseFloat(potassiumMg) : 0;
  const calculatedPotassiumMg =
    potassiumMgNum > 0 ? Math.round(potassiumMgNum) : 0;

  // ─── Recent eating records ────────────────────────────────────────
  const recentRecords = useEatingRecords(5);

  // ─── Sodium lookup for recent entries ─────────────────────────────
  const groupIds = useMemo(
    () => (recentRecords || []).map((r) => r.groupId).filter((id): id is string => !!id),
    [recentRecords]
  );

  const groupSodiumMap = useSaltTotalsByGroupIds(groupIds);
  const groupSugarMap = useSugarTotalsByGroupIds(groupIds);
  const groupPotassiumMap = usePotassiumTotalsByGroupIds(groupIds);

  const deleteMutation = useDeleteEating();
  const syncEatingGroupMutation = useSyncEatingGroup();
  const { deletingId, handleDelete } = useDeleteWithToast(
    deleteMutation,
    "Eating record removed"
  );

  // Extra edit fields
  const [editGrams, setEditGrams] = useState("");
  const [editSodiumMg, setEditSodiumMg] = useState("");
  const [editSodiumSource, setEditSodiumSource] = useState<SodiumSource>("sodium");
  const [editSugarG, setEditSugarG] = useState("");
  const [editPotassiumMg, setEditPotassiumMg] = useState("");
  const [editWaterMl, setEditWaterMl] = useState("");
  // Token to discard stale fetchEntryGroup results when opening another record
  const openTokenRef = useRef(0);

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
    onOpen: (record) => {
      const token = ++openTokenRef.current;
      setEditGrams(record.grams?.toString() || "");
      setEditSodiumMg("");
      setEditSodiumSource("sodium");
      setEditSugarG("");
      setEditPotassiumMg("");
      setEditWaterMl("");
      if (record.groupId) {
        void fetchEntryGroup(record.groupId).then((group) => {
          if (token !== openTokenRef.current) return;
          if (!group) return;
          const salt = group.intakes.find((r) => r.type === "salt");
          const sugar = group.intakes.find(
            (r) => r.type === "sugar" && r.source === "manual:sugar",
          );
          const potassium = group.intakes.find(
            (r) => r.type === "potassium" && r.source === "manual:potassium",
          );
          const water = group.intakes.find(
            (r) => r.type === "water" && r.source === "manual:food_water_content",
          );
          if (salt) {
            const kind = sodiumKindFromSource(salt.source);
            // back-convert stored sodium-mg to the user's input units
            const multiplier = SODIUM_MULTIPLIERS[kind];
            const inputValue = Math.round(salt.amount / multiplier);
            setEditSodiumMg(inputValue.toString());
            setEditSodiumSource(kind);
          }
          if (sugar) {
            setEditSugarG(sugar.amount.toString());
          }
          if (potassium) {
            setEditPotassiumMg(potassium.amount.toString());
          }
          if (water) {
            setEditWaterMl(water.amount.toString());
          }
        });
      }
    },
    buildUpdates: (timestamp, note) => {
      const g = editGrams ? parseInt(editGrams, 10) : undefined;
      const sodiumInput = editSodiumMg ? parseFloat(editSodiumMg) : 0;
      const calculatedSodiumMg =
        sodiumInput > 0
          ? Math.round(sodiumInput * SODIUM_MULTIPLIERS[editSodiumSource])
          : 0;
      const waterInput = editWaterMl ? parseFloat(editWaterMl) : 0;
      const sugarInput = editSugarG ? parseFloat(editSugarG) : 0;
      const potassiumInput = editPotassiumMg ? parseFloat(editPotassiumMg) : 0;
      // When a tracker is disabled we omit its field entirely so
      // syncEatingGroup leaves any pre-existing linked record untouched.
      return {
        timestamp,
        note,
        grams: g && g > 0 ? g : undefined,
        sodiumMg: calculatedSodiumMg,
        sodiumKind: editSodiumSource,
        waterMl: waterInput > 0 ? Math.round(waterInput) : 0,
        ...(sugarEnabled && {
          sugarG: sugarInput > 0 ? Math.round(sugarInput) : 0,
        }),
        ...(potassiumEnabled && {
          potassiumMg: potassiumInput > 0 ? Math.round(potassiumInput) : 0,
        }),
      };
    },
    mutateAsync: async ({ id, updates }) => {
      await syncEatingGroupMutation(
        id,
        updates as Parameters<typeof syncEatingGroupMutation>[1],
      );
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFoodText("");
    setDetailGrams("");
    setSodiumMg("");
    setSodiumSource("sodium");
    setSugarG("");
    setPotassiumMg("");
    setWaterMl("");
    setAiPopulated(false);
  }, []);

  const handleParse = useCallback(async () => {
    const trimmed = foodText.trim();
    if (!trimmed || isParsing) return;

    setIsParsing(true);
    try {
      const result = await parseIntakeWithAI(trimmed);

      // User dismissed the sign-in prompt
      if (!result) return;

      if (result.valueMg && result.valueMg > 0) {
        setSodiumMg(result.valueMg.toString());
        setSodiumSource("sodium");
      }
      if (result.water && result.water > 0) {
        setWaterMl(result.water.toString());
      }
      if (sugarEnabled && result.sugarG && result.sugarG > 0) {
        setSugarG(result.sugarG.toString());
      }
      if (potassiumEnabled && result.potassiumMg && result.potassiumMg > 0) {
        setPotassiumMg(result.potassiumMg.toString());
      }
      setAiPopulated(true);

      // Show reasoning as a toast
      if (result.reasoning) {
        toast({
          title: "AI estimate",
          description: result.reasoning,
          variant: "default",
        });
      }
    } catch {
      toast({
        title: "AI parsing failed",
        description: "Try again or add details manually.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  }, [foodText, isParsing, toast, sugarEnabled, potassiumEnabled]);

  const handleDetailSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!hasSodium) {
      toast({
        title: "Sodium required",
        description: "Enter a sodium amount before saving.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Capture timestamp at moment of submission
      const timestamp = dateTimeLocalToTimestamp(getCurrentDateTimeLocal());
      const grams = detailGrams ? parseInt(detailGrams, 10) : undefined;
      const note = foodText.trim() || undefined;

      // Build intakes for composable entry
      const intakes: ComposableEntryInput["intakes"] = [];
      if (calculatedSodiumMg > 0) {
        intakes.push({
          type: "salt",
          amount: calculatedSodiumMg,
          source: `manual:${sodiumSource}`,
        });
      }
      if (sugarEnabled && calculatedSugarG > 0) {
        intakes.push({
          type: "sugar",
          amount: calculatedSugarG,
          source: "manual:sugar",
        });
      }
      if (potassiumEnabled && calculatedPotassiumMg > 0) {
        intakes.push({
          type: "potassium",
          amount: calculatedPotassiumMg,
          source: "manual:potassium",
        });
      }
      const waterMlNum = waterMl ? parseFloat(waterMl) : 0;
      if (waterMlNum > 0) {
        const trimmedFood = foodText.trim();
        intakes.push({
          type: "water",
          amount: Math.round(waterMlNum),
          source: "manual:food_water_content",
          ...(trimmedFood && { note: trimmedFood }),
        });
      }

      // Use composable entry if we have intakes or AI-populated data
      if (intakes.length > 0 || aiPopulated) {
        const input: ComposableEntryInput = {
          eating: {
            ...(note !== undefined && { note }),
            ...(grams !== undefined && grams > 0 && { grams }),
          },
          ...(intakes.length > 0 && { intakes }),
          ...(aiPopulated && { originalInputText: foodText.trim() }),
          groupSource: aiPopulated ? "ai_food_parse" : "manual_food_entry",
        };
        await addComposableEntry(input, timestamp);
      } else {
        // Plain eating record (no sodium/water)
        await addEatingMutation.mutateAsync({
          timestamp,
          ...(note !== undefined && { note }),
          ...(grams !== undefined && grams > 0 && { grams }),
        });
      }

      toast({
        title: "Logged",
        description: note ? "Meal with details recorded" : "Eating event recorded",
        variant: "success",
      });
      resetForm();
    } catch {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    hasSodium,
    foodText,
    detailGrams,
    calculatedSodiumMg,
    sodiumSource,
    calculatedSugarG,
    calculatedPotassiumMg,
    sugarEnabled,
    potassiumEnabled,
    waterMl,
    aiPopulated,
    addComposableEntry,
    addEatingMutation,
    toast,
    resetForm,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleParse();
      }
    },
    [handleParse]
  );

  return (
    <>
      {/* "What I ate" text input — doubles as AI parse input when signed in */}
      <div className="relative mt-3">
        <Input
          value={foodText}
          onChange={(e) => setFoodText(e.target.value)}
          onKeyDown={showAi ? handleKeyDown : undefined}
          placeholder="What I ate..."
          aria-label={showAi ? "Describe food for AI nutritional parsing" : "Describe what you ate"}
          className={cn("h-10", showAi && "pr-10")}
          disabled={isParsing}
        />
        {showAi && (
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
        )}
      </div>

      {/* Always-visible detail fields */}
      <div className="space-y-3 mt-3">
        {/* Weight in grams */}
        <div className="space-y-1">
          <Label htmlFor="eating-grams" className="text-sm">
            Weight (g){" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
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

        {/* Sodium section */}
        <div className="space-y-1">
          <Label htmlFor="eating-sodium" className="text-sm">
            Sodium <span className="text-red-600 dark:text-red-400">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="eating-sodium"
              type="number"
              min="0"
              placeholder="mg"
              value={sodiumMg}
              onChange={(e) => setSodiumMg(e.target.value)}
              required
              aria-required="true"
              className="flex-1"
            />
            <Select
              value={sodiumSource}
              onValueChange={(v) => setSodiumSource(v as SodiumSource)}
            >
              <SelectTrigger className="w-[120px]" aria-label="Measurement source">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sodium">Sodium</SelectItem>
                <SelectItem value="salt">Salt</SelectItem>
                <SelectItem value="msg">MSG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {calculatedSodiumMg > 0 && sodiumSource !== "sodium" && (
            <p className="text-xs text-muted-foreground">
              = {calculatedSodiumMg}mg sodium
            </p>
          )}
        </div>

        {/* Sugar section — optional tracker */}
        {sugarEnabled && (
          <div className="space-y-1" data-testid="eating-sugar-field">
            <Label htmlFor="eating-sugar" className="text-sm">
              Sugar (g){" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="eating-sugar"
              type="number"
              min="0"
              placeholder="g"
              value={sugarG}
              onChange={(e) => setSugarG(e.target.value)}
            />
          </div>
        )}

        {/* Potassium section — optional tracker */}
        {potassiumEnabled && (
          <div className="space-y-1" data-testid="eating-potassium-field">
            <Label htmlFor="eating-potassium" className="text-sm">
              Potassium (mg){" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="eating-potassium"
              type="number"
              min="0"
              placeholder="mg"
              value={potassiumMg}
              onChange={(e) => setPotassiumMg(e.target.value)}
            />
          </div>
        )}

        {/* Water content */}
        <div className="space-y-1">
          <Label htmlFor="eating-water" className="text-sm">
            Water content (ml){" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="eating-water"
            type="number"
            min="0"
            placeholder="ml"
            value={waterMl}
            onChange={(e) => setWaterMl(e.target.value)}
          />
        </div>

        {/* Record button — always visible */}
        <Button
          onClick={handleDetailSubmit}
          disabled={addEatingMutation.isPending || isSubmitting || !hasSodium}
          className={cn("w-full mt-2", theme.buttonBg)}
        >
          {addEatingMutation.isPending || isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Record with details"
          )}
        </Button>
        {!hasSodium && (
          <p className="text-xs text-muted-foreground -mt-1">
            Enter a sodium amount to enable saving.
          </p>
        )}
      </div>

      {/* Recent Eating Records */}
      <RecentEntriesList
        records={recentRecords}
        deletingId={deletingId}
        onDelete={handleDelete}
        onEdit={openEdit}
        editingId={editingRecord?.id ?? null}
        borderColor={theme.border}
        renderEntry={(record) => {
          const sodium = record.groupId ? groupSodiumMap.get(record.groupId) : undefined;
          const sugar = sugarEnabled && record.groupId ? groupSugarMap.get(record.groupId) : undefined;
          const potassium = potassiumEnabled && record.groupId ? groupPotassiumMap.get(record.groupId) : undefined;
          const hasMetrics = Boolean(sodium || sugar || potassium || record.grams);
          return (
            <div className="flex flex-col gap-1 min-w-0 w-full">
              {/* Row 1: when + note */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">
                  {formatDateTime(record.timestamp)}
                </span>
                {record.note && (
                  <span className="text-xs text-muted-foreground/70 truncate min-w-0">
                    {record.note}
                  </span>
                )}
              </div>
              {/* Row 2: nutrition metrics */}
              {hasMetrics && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                  {sodium ? (
                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                      {sodium}mg
                    </span>
                  ) : null}
                  {sugar ? (
                    <span className="text-xs font-medium text-pink-600 dark:text-pink-400">
                      {sugar}g sugar
                    </span>
                  ) : null}
                  {potassium ? (
                    <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                      {potassium}mg K
                    </span>
                  ) : null}
                  {record.grams && (
                    <span className="text-xs font-medium">{record.grams}g</span>
                  )}
                </div>
              )}
            </div>
          );
        }}
        renderEditForm={() => (
          <InlineEditFormShell timestamp={editTimestamp} onTimestampChange={setEditTimestamp} note={editNote} onNoteChange={setEditNote} onSave={() => handleEditSubmit()} onCancel={closeEdit} buttonClassName={theme.buttonBg}>
            <div className="space-y-1">
              <Label htmlFor="edit-eating-grams" className="text-xs text-muted-foreground">Weight (g)</Label>
              <Input
                id="edit-eating-grams"
                type="number"
                placeholder="optional"
                value={editGrams}
                onChange={(e) => setEditGrams(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-eating-sodium" className="text-xs text-muted-foreground">Sodium</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-eating-sodium"
                  type="number"
                  min="0"
                  placeholder="mg"
                  value={editSodiumMg}
                  onChange={(e) => setEditSodiumMg(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
                <Select
                  value={editSodiumSource}
                  onValueChange={(v) => setEditSodiumSource(v as SodiumSource)}
                >
                  <SelectTrigger className="h-8 text-sm w-[100px]" aria-label="Measurement source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sodium">Sodium</SelectItem>
                    <SelectItem value="salt">Salt</SelectItem>
                    <SelectItem value="msg">MSG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sugarEnabled && (
              <div className="space-y-1">
                <Label htmlFor="edit-eating-sugar" className="text-xs text-muted-foreground">Sugar (g)</Label>
                <Input
                  id="edit-eating-sugar"
                  type="number"
                  min="0"
                  placeholder="optional"
                  value={editSugarG}
                  onChange={(e) => setEditSugarG(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            )}
            {potassiumEnabled && (
              <div className="space-y-1">
                <Label htmlFor="edit-eating-potassium" className="text-xs text-muted-foreground">Potassium (mg)</Label>
                <Input
                  id="edit-eating-potassium"
                  type="number"
                  min="0"
                  placeholder="optional"
                  value={editPotassiumMg}
                  onChange={(e) => setEditPotassiumMg(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="edit-eating-water" className="text-xs text-muted-foreground">Water content (ml)</Label>
              <Input
                id="edit-eating-water"
                type="number"
                min="0"
                placeholder="optional"
                value={editWaterMl}
                onChange={(e) => setEditWaterMl(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </InlineEditFormShell>
        )}
      />
    </>
  );
}
