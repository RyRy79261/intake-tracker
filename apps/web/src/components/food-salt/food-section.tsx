"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import { parseIntakeWithAI } from "@/lib/ai-client";
import {
  SODIUM_SOURCE_LABELS,
  SODIUM_SOURCES,
  SODIUM_SOURCE_UNITS,
  isSodiumSource,
  isSodiumSourceUnit,
  toSodiumMg,
  type SodiumSource,
  type SodiumSourceUnit,
} from "@intake/core/sodium";
import { useAuthGate } from "@/components/auth-guard";
import {
  useAddComposableEntry,
  useSyncEatingGroup,
  fetchEntryGroup,
  eatingGroupNutrients,
  type ComposableEntryInput,
} from "@/hooks/use-composable-entry";
import { useLogDrink } from "@/hooks/use-drink-log";
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
import { useToast } from "@intake/ui/use-toast";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { type EatingRecord } from "@/lib/db";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { waterContentPercentFromAbv } from "@intake/core/alcohol";
import { useFieldId, useOnLogged } from "@/components/log-form-scope";

const theme = CARD_THEMES.eating;

// ─── Sodium entry ──────────────────────────────────────────────────
// Salt is not sodium. The field takes an amount of salt, MSG or sodium in mg
// or g; the record stores the sodium mg (fractions in @intake/core/sodium)
// plus what was typed, so the entry reads and edits as entered.

/** Sodium mg (rounded, as stored) for a typed amount, or 0 when blank/invalid. */
function sodiumMgFromInput(
  value: string,
  unit: SodiumSourceUnit,
  source: SodiumSource,
): number {
  const n = value ? parseFloat(value) : 0;
  return n > 0 ? Math.round(toSodiumMg(n, unit, source)) : 0;
}

function SodiumSourceSelect({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: SodiumSource;
  onChange: (v: SodiumSource) => void;
  ariaLabel: string;
  className: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SodiumSource)}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder="Source" />
      </SelectTrigger>
      <SelectContent>
        {SODIUM_SOURCES.map((s) => (
          <SelectItem key={s} value={s}>
            {SODIUM_SOURCE_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SodiumUnitSelect({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: SodiumSourceUnit;
  onChange: (v: SodiumSourceUnit) => void;
  ariaLabel: string;
  className: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SodiumSourceUnit)}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SODIUM_SOURCE_UNITS.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FoodSection() {
  const onLogged = useOnLogged();
  const fid = useFieldId();
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
  const [sodiumUnit, setSodiumUnit] = useState<SodiumSourceUnit>("mg");
  const [sugarG, setSugarG] = useState("");
  const [potassiumMg, setPotassiumMg] = useState("");
  const [waterMl, setWaterMl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Event-time control: defaults to "now", but lets the user backdate the
  // whole entry at creation instead of editing each item afterward.
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());
  // Track whether AI populated form fields (determines composable vs plain submit)
  const [aiPopulated, setAiPopulated] = useState(false);
  // Set when the last AI parse said the item is a drink. Such an entry is
  // logged through logDrink, like the voice and Liquids paths, so its caffeine
  // or alcohol is recorded and it deletes as one drink.
  const [parsedDrink, setParsedDrink] = useState<{
    caffeineMg: number | null;
    abvPercent: number | null;
  } | null>(null);
  const logDrink = useLogDrink();

  // ─── Derived sodium calculation ───────────────────────────────────
  const sodiumMgNum = sodiumMg ? parseFloat(sodiumMg) : 0;
  const calculatedSodiumMg = sodiumMgFromInput(sodiumMg, sodiumUnit, sodiumSource);

  // ─── Derived sugar calculation ────────────────────────────────────
  const sugarGNum = sugarG ? parseFloat(sugarG) : 0;
  const calculatedSugarG = sugarGNum > 0 ? Math.round(sugarGNum) : 0;

  // ─── Derived potassium calculation ────────────────────────────────
  const potassiumMgNum = potassiumMg ? parseFloat(potassiumMg) : 0;
  const calculatedPotassiumMg =
    potassiumMgNum > 0 ? Math.round(potassiumMgNum) : 0;

  // ─── Derived water calculation ────────────────────────────────────
  const waterMlNumRaw = waterMl ? parseFloat(waterMl) : 0;
  const calculatedWaterMl = waterMlNumRaw > 0 ? Math.round(waterMlNumRaw) : 0;

  // Saving needs *some* value, not sodium specifically. Gating on sodium alone
  // meant a drink the AI parsed as water + sugar (sodium 0, which the parse
  // prompt explicitly permits) could not be saved at all, and its parsed
  // numbers were lost on unmount or re-parse.
  //
  // Gate on the *rounded* values, the ones submission actually persists —
  // 0.4 g of sugar would otherwise enable the button and then round to zero,
  // saving a bare eating record with none of the nutrient the user typed.
  const hasRecordableValue =
    calculatedSodiumMg > 0 ||
    calculatedWaterMl > 0 ||
    (sugarEnabled && calculatedSugarG > 0) ||
    (potassiumEnabled && calculatedPotassiumMg > 0);

  // A plain meal — a description or a weight, no nutrient numbers — is still
  // an eating event worth logging (meal frequency). Only an entry with nothing
  // at all is refused.
  const detailGramsNum = detailGrams ? parseInt(detailGrams, 10) : 0;
  const hasMealDetail = foodText.trim() !== "" || detailGramsNum > 0;
  const canSave = hasRecordableValue || hasMealDetail;
  // Only a drink with a volume can go through logDrink.
  const saveAsDrink = parsedDrink !== null && calculatedWaterMl > 0;
  // For a drink the field holds the drink's full volume (the parse prompt
  // reports it that way); an alcoholic drink's ethanol is not water, so
  // logDrink books only the non-alcohol share.
  const drinkWaterPercent = waterContentPercentFromAbv(parsedDrink?.abvPercent);
  const drinkWaterMl = Math.max(1, Math.round((calculatedWaterMl * drinkWaterPercent) / 100));

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
    "Eating record removed",
    { undoToast: true }
  );

  // Extra edit fields
  const [editGrams, setEditGrams] = useState("");
  const [editSodiumMg, setEditSodiumMg] = useState("");
  const [editSodiumSource, setEditSodiumSource] = useState<SodiumSource>("sodium");
  const [editSodiumUnit, setEditSodiumUnit] = useState<SodiumSourceUnit>("mg");
  // The sodium inputs as prefilled. Saving them unchanged leaves the stored
  // row alone — a legacy row keeps its value and unknown source.
  const editSodiumPrefillRef = useRef<{
    value: string;
    source: SodiumSource;
    unit: SodiumSourceUnit;
  }>({ value: "", source: "sodium", unit: "mg" });
  const [editSugarG, setEditSugarG] = useState("");
  const [editPotassiumMg, setEditPotassiumMg] = useState("");
  const [editWaterMl, setEditWaterMl] = useState("");
  // Token to discard stale fetchEntryGroup results when opening another record
  const openTokenRef = useRef(0);
  // The nutrient fields are filled asynchronously from the entry's group.
  // Saving before that resolves (or after it failed) would send 0 for every
  // nutrient, which syncEatingGroup reads as "delete the linked row".
  const [editPrefill, setEditPrefill] = useState<"ready" | "loading" | "failed">("ready");

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
      setEditSodiumUnit("mg");
      editSodiumPrefillRef.current = { value: "", source: "sodium", unit: "mg" };
      setEditSugarG("");
      setEditPotassiumMg("");
      setEditWaterMl("");
      setEditPrefill(record.groupId ? "loading" : "ready");
      if (record.groupId) {
        void fetchEntryGroup(record.groupId).then((group) => {
          if (token !== openTokenRef.current) return;
          setEditPrefill("ready");
          if (!group) return;
          // Same selection syncEatingGroup reconciles against, so a legacy
          // row (e.g. source food:ai_parse) is edited rather than duplicated.
          const nutrients = eatingGroupNutrients(group.intakes);
          const salt = nutrients.salts[0];
          const sugar = nutrients.sugars[0];
          const potassium = nutrients.potassiums[0];
          const water = nutrients.waters[0];
          if (salt) {
            // Show the entry as typed when the row recorded it; otherwise
            // (older rows) it is sodium mg with an unknown source — shown as
            // stored, never back-converted through a guessed fraction.
            const prefill =
              // Type guards, not `!== undefined`: a restored backup may carry
              // explicit nulls for these fields.
              isSodiumSource(salt.sodiumSource) &&
              typeof salt.sourceAmount === "number" &&
              Number.isFinite(salt.sourceAmount) &&
              isSodiumSourceUnit(salt.sourceUnit)
                ? {
                    value: String(salt.sourceAmount),
                    source: salt.sodiumSource,
                    unit: salt.sourceUnit,
                  }
                : { value: String(salt.amount), source: "sodium" as const, unit: "mg" as const };
            editSodiumPrefillRef.current = prefill;
            setEditSodiumMg(prefill.value);
            setEditSodiumSource(prefill.source);
            setEditSodiumUnit(prefill.unit);
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
        }, () => {
          if (token !== openTokenRef.current) return;
          setEditPrefill("failed");
        });
      }
    },
    buildUpdates: (timestamp, note) => {
      if (editPrefill !== "ready") {
        toast({
          title: editPrefill === "loading" ? "Still loading" : "Could not load this entry",
          description:
            editPrefill === "loading"
              ? "Wait for the entry's details to load before saving."
              : "Its sodium and water could not be read, so saving is blocked to keep them intact.",
          variant: "destructive",
        });
        return null;
      }
      const g = editGrams ? parseInt(editGrams, 10) : undefined;
      const sodiumInput = editSodiumMg ? parseFloat(editSodiumMg) : 0;
      const calculatedSodiumMg = sodiumMgFromInput(editSodiumMg, editSodiumUnit, editSodiumSource);
      const prefill = editSodiumPrefillRef.current;
      const sodiumEdited =
        editSodiumMg !== prefill.value ||
        editSodiumSource !== prefill.source ||
        editSodiumUnit !== prefill.unit;
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
        ...(sodiumEdited && calculatedSodiumMg > 0 && {
          sodiumEntry: { amount: sodiumInput, unit: editSodiumUnit },
        }),
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
    setSodiumUnit("mg");
    setSugarG("");
    setPotassiumMg("");
    setWaterMl("");
    setAiPopulated(false);
    setParsedDrink(null);
    setShowTimeInput(false);
    setCustomTime(getCurrentDateTimeLocal());
  }, []);

  const handleParse = useCallback(async () => {
    const trimmed = foodText.trim();
    if (!trimmed || isParsing) return;

    setIsParsing(true);
    try {
      const result = await parseIntakeWithAI(trimmed);

      // User dismissed the sign-in prompt
      if (!result) return;

      // A parse is a complete answer for the new item: every field takes the
      // new value, and a 0 / null clears it. Keeping only the positive values
      // left the previous item's sugar or water in place for the next save.
      const asField = (v: number | null | undefined) =>
        v !== null && v !== undefined && v > 0 ? v.toString() : "";
      setSodiumMg(asField(result.valueMg));
      setSodiumSource("sodium");
      setSodiumUnit("mg");
      setWaterMl(asField(result.water));
      if (sugarEnabled) setSugarG(asField(result.sugarG));
      if (potassiumEnabled) setPotassiumMg(asField(result.potassiumMg));
      setParsedDrink(
        result.isDrink
          ? { caffeineMg: result.caffeineMg, abvPercent: result.abvPercent }
          : null,
      );
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
    if (!canSave) {
      toast({
        title: "Nothing to record",
        description: "Describe what you ate, or enter a weight or nutrient amount before saving.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Default to "now"; use the custom event time when the user opened it.
      const timestamp = showTimeInput
        ? dateTimeLocalToTimestamp(customTime)
        : Date.now();
      const grams = detailGrams ? parseInt(detailGrams, 10) : undefined;
      const note = foodText.trim() || undefined;

      if (saveAsDrink && parsedDrink) {
        await logDrink({
          volumeMl: calculatedWaterMl,
          waterContentPercent: drinkWaterPercent,
          description: foodText.trim() || "Drink",
          ...(parsedDrink.caffeineMg !== null && parsedDrink.caffeineMg > 0 && {
            caffeineMg: parsedDrink.caffeineMg,
          }),
          ...(parsedDrink.abvPercent !== null && parsedDrink.abvPercent > 0 && {
            abvPercent: parsedDrink.abvPercent,
          }),
          ...(calculatedSodiumMg > 0 && {
            saltMg: calculatedSodiumMg,
            sodiumEntry: { source: sodiumSource, amount: sodiumMgNum, unit: sodiumUnit },
          }),
          ...(sugarEnabled && calculatedSugarG > 0 && { sugarG: calculatedSugarG }),
          ...(potassiumEnabled && calculatedPotassiumMg > 0 && {
            potassiumMg: calculatedPotassiumMg,
          }),
          groupSource: "ai_food_parse",
          originalInputText: foodText.trim(),
          timestamp,
        });
        toast({ title: "Logged", description: "Drink recorded", variant: "success" });
        onLogged();
        resetForm();
        return;
      }

      // Build intakes for composable entry
      const intakes: ComposableEntryInput["intakes"] = [];
      if (calculatedSodiumMg > 0) {
        intakes.push({
          type: "salt",
          amount: calculatedSodiumMg,
          source: `manual:${sodiumSource}`,
          sodiumSource,
          sourceAmount: sodiumMgNum,
          sourceUnit: sodiumUnit,
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
      // Same derived value the save gate reads, so the two cannot diverge.
      if (calculatedWaterMl > 0) {
        const trimmedFood = foodText.trim();
        intakes.push({
          type: "water",
          amount: calculatedWaterMl,
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
      onLogged();
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
    onLogged,
    isSubmitting,
    canSave,
    saveAsDrink,
    parsedDrink,
    logDrink,
    foodText,
    detailGrams,
    calculatedSodiumMg,
    sodiumMgNum,
    sodiumSource,
    sodiumUnit,
    calculatedSugarG,
    calculatedPotassiumMg,
    sugarEnabled,
    potassiumEnabled,
    calculatedWaterMl,
    drinkWaterPercent,
    aiPopulated,
    showTimeInput,
    customTime,
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
          <Label htmlFor={fid("eating-grams")} className="text-sm">
            Weight (g){" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={fid("eating-grams")}
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
          <Label htmlFor={fid("eating-sodium")} className="text-sm">
            Sodium
          </Label>
          <div className="flex gap-2">
            <Input
              id={fid("eating-sodium")}
              type="number"
              min="0"
              step="any"
              placeholder={sodiumUnit}
              value={sodiumMg}
              onChange={(e) => setSodiumMg(e.target.value)}
              className="flex-1 min-w-0"
            />
            <SodiumSourceSelect
              value={sodiumSource}
              onChange={setSodiumSource}
              ariaLabel="Measured as"
              className="w-[100px]"
            />
            <SodiumUnitSelect
              value={sodiumUnit}
              onChange={setSodiumUnit}
              ariaLabel="Unit"
              className="w-[68px]"
            />
          </div>
          {calculatedSodiumMg > 0 && (sodiumSource !== "sodium" || sodiumUnit !== "mg") && (
            <p className="text-xs text-muted-foreground">
              = {calculatedSodiumMg}mg sodium
            </p>
          )}
        </div>

        {/* Sugar section — optional tracker */}
        {sugarEnabled && (
          <div className="space-y-1" data-testid="eating-sugar-field">
            <Label htmlFor={fid("eating-sugar")} className="text-sm">
              Sugar (g){" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id={fid("eating-sugar")}
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
            <Label htmlFor={fid("eating-potassium")} className="text-sm">
              Potassium (mg){" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id={fid("eating-potassium")}
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
          <Label htmlFor={fid("eating-water")} className="text-sm">
            Water content (ml){" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={fid("eating-water")}
            type="number"
            min="0"
            placeholder="ml"
            value={waterMl}
            onChange={(e) => setWaterMl(e.target.value)}
          />
        </div>

        <CollapsibleTimeInputControlled
          value={customTime}
          onChange={setCustomTime}
          expanded={showTimeInput}
          onToggle={() => setShowTimeInput((v) => !v)}
          label="When did you have this?"
        />

        {/* Record button — always visible */}
        <Button
          onClick={handleDetailSubmit}
          disabled={addEatingMutation.isPending || isSubmitting || !canSave}
          className={cn("w-full mt-2", theme.buttonBg)}
        >
          {addEatingMutation.isPending || isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Record with details"
          )}
        </Button>
        {!canSave && (
          <p className="text-xs text-muted-foreground -mt-1">
            Describe what you ate, or enter a weight or a sodium, water, sugar or potassium amount to enable saving.
          </p>
        )}
        {saveAsDrink && parsedDrink && (
          <p className="text-xs text-muted-foreground -mt-1" data-testid="food-save-as-drink">
            Will be logged as a drink
            {parsedDrink.caffeineMg !== null && parsedDrink.caffeineMg > 0
              ? ` with ${Math.round(parsedDrink.caffeineMg)} mg caffeine`
              : ""}
            {parsedDrink.abvPercent !== null && parsedDrink.abvPercent > 0
              ? ` (${parsedDrink.abvPercent}% ABV, ${drinkWaterMl} ml counted as water)`
              : ""}
            .
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
                      {sodium}mg Na
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
            {editPrefill !== "ready" && (
              <p className="text-xs text-muted-foreground" role="status">
                {editPrefill === "loading"
                  ? "Loading this entry's details…"
                  : "Could not load this entry's details; saving is disabled."}
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor={fid("edit-eating-grams")} className="text-xs text-muted-foreground">Weight (g)</Label>
              <Input
                id={fid("edit-eating-grams")}
                type="number"
                placeholder="optional"
                value={editGrams}
                onChange={(e) => setEditGrams(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fid("edit-eating-sodium")} className="text-xs text-muted-foreground">Sodium</Label>
              <div className="flex gap-2">
                <Input
                  id={fid("edit-eating-sodium")}
                  type="number"
                  min="0"
                  step="any"
                  placeholder={editSodiumUnit}
                  value={editSodiumMg}
                  onChange={(e) => setEditSodiumMg(e.target.value)}
                  className="h-8 text-sm flex-1 min-w-0"
                />
                <SodiumSourceSelect
                  value={editSodiumSource}
                  onChange={setEditSodiumSource}
                  ariaLabel="Edit measured as"
                  className="h-8 text-sm w-[90px]"
                />
                <SodiumUnitSelect
                  value={editSodiumUnit}
                  onChange={setEditSodiumUnit}
                  ariaLabel="Edit unit"
                  className="h-8 text-sm w-[64px]"
                />
              </div>
            </div>
            {sugarEnabled && (
              <div className="space-y-1">
                <Label htmlFor={fid("edit-eating-sugar")} className="text-xs text-muted-foreground">Sugar (g)</Label>
                <Input
                  id={fid("edit-eating-sugar")}
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
                <Label htmlFor={fid("edit-eating-potassium")} className="text-xs text-muted-foreground">Potassium (mg)</Label>
                <Input
                  id={fid("edit-eating-potassium")}
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
              <Label htmlFor={fid("edit-eating-water")} className="text-xs text-muted-foreground">Water content (ml)</Label>
              <Input
                id={fid("edit-eating-water")}
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
