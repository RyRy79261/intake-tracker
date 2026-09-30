"use client";

import { useState, useMemo, useRef, useCallback, useReducer } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { SegmentBar } from "@/components/home/module-card";
import { Sparkles, Check } from "lucide-react";
import { FieldScope, Pip } from "@/components/domain-scope";
import { Spinner } from "@intake/ui/spinner";
import { apiFetch } from "@/lib/api-fetch";
import { readAiErrorMessage } from "@/lib/ai-error-message";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { useSettings } from "@/hooks/use-settings";
import { useIntake } from "@/hooks/use-intake-queries";
import { useLogDrink, type LogDrinkInput } from "@/hooks/use-drink-log";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { reportSaveError } from "@/lib/db-recovery";
import { useToast } from "@intake/ui/use-toast";
import { useAuthGate } from "@/components/auth-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@intake/ui/alert-dialog";
import type { LiquidPreset } from "@/lib/constants";
import type { SubstanceLookupResponse } from "@/lib/substance-lookup-schema";
import {
  standardDrinksFromAbv,
  waterContentPercentFromAbv,
} from "@intake/core/alcohol";
import { useFieldId, useOnLogged } from "@/components/log-form-scope";
import { useInPreview } from "@/lib/help/preview-context";

type PresetTabKind = "coffee" | "alcohol";

interface PresetTabProps {
  tab: PresetTabKind;
}

/**
 * Everything that describes the drink being entered. It lives in one reducer
 * so a preset tap, a deselect or an AI lookup replaces the whole drink at
 * once. As separate useState calls, each path set the fields it knew about
 * and left the rest — sugar typed for a cola, or salt from a salted preset,
 * was then logged against the next espresso.
 */
interface DrinkForm {
  selectedPresetId: string | null;
  volumeMl: number;
  caffeinePer100ml: number;
  /** % ABV. */
  alcoholPer100ml: number;
  /** mg sodium per 100 ml. */
  saltPer100ml: number;
  /** g sugar per 100 ml, from a preset or lookup; scaled by the volume. */
  sugarPer100ml: number;
  /**
   * Grams the user typed into the sugar field. It replaces the per-100ml
   * figure until the next preset, lookup or reset. `null` = not typed.
   */
  sugarGInput: string | null;
  /**
   * Share of the volume that is water, from a preset or lookup. `null` =
   * unknown (a hand-typed drink): derived from the ABV, see
   * {@link resolveWaterContentPercent}.
   */
  waterContentPercent: number | null;
  beverageName: string;
  /** Whether the current values came from an AI lookup (enables save-as-preset). */
  aiLookupUsed: boolean;
}

const EMPTY_FORM: DrinkForm = {
  selectedPresetId: null,
  volumeMl: 0,
  caffeinePer100ml: 0,
  alcoholPer100ml: 0,
  saltPer100ml: 0,
  sugarPer100ml: 0,
  sugarGInput: null,
  waterContentPercent: null,
  beverageName: "",
  aiLookupUsed: false,
};

type DrinkFormAction =
  | { type: "selectPreset"; preset: LiquidPreset }
  | { type: "reset" }
  | { type: "lookup"; tab: PresetTabKind; result: SubstanceLookupResponse }
  | { type: "setVolume"; volumeMl: number }
  | { type: "setPrimary"; tab: PresetTabKind; value: number }
  | { type: "setSugar"; value: string }
  | { type: "setName"; value: string };

function drinkFormReducer(state: DrinkForm, action: DrinkFormAction): DrinkForm {
  switch (action.type) {
    case "selectPreset": {
      const { preset } = action;
      return {
        ...EMPTY_FORM,
        selectedPresetId: preset.id,
        volumeMl: preset.defaultVolumeMl,
        caffeinePer100ml: preset.caffeinePer100ml ?? 0,
        alcoholPer100ml: preset.alcoholPer100ml ?? 0,
        saltPer100ml: preset.saltPer100ml ?? 0,
        sugarPer100ml: preset.sugarPer100ml ?? 0,
        waterContentPercent: preset.waterContentPercent,
        beverageName: preset.name,
      };
    }
    case "reset":
      return EMPTY_FORM;
    case "lookup": {
      const { result, tab } = action;
      const substance = result.substancePer100ml ?? 0;
      return {
        ...EMPTY_FORM,
        volumeMl: result.defaultVolumeMl,
        caffeinePer100ml: tab === "coffee" ? substance : 0,
        alcoholPer100ml: tab === "alcohol" ? substance : 0,
        saltPer100ml: result.sodiumPer100ml ?? 0,
        sugarPer100ml: result.sugarPer100ml ?? 0,
        waterContentPercent: result.waterContentPercent ?? null,
        beverageName: result.beverageName,
        aiLookupUsed: true,
      };
    }
    case "setVolume":
      return { ...state, volumeMl: action.volumeMl, selectedPresetId: null };
    case "setPrimary":
      return action.tab === "coffee"
        ? { ...state, caffeinePer100ml: action.value, selectedPresetId: null }
        : { ...state, alcoholPer100ml: action.value, selectedPresetId: null };
    case "setSugar":
      return { ...state, sugarGInput: action.value };
    case "setName":
      return { ...state, beverageName: action.value };
  }
}

/**
 * The water share `logDrink` books for this drink, in (0, 100]. A preset or
 * lookup value wins; otherwise (or if it is out of range) the non-alcohol
 * share of the drink — a hand-typed 40% spirit is 60% water.
 */
function resolveWaterContentPercent(
  waterContentPercent: number | null,
  abvPercent: number,
): number {
  if (
    waterContentPercent !== null &&
    Number.isFinite(waterContentPercent) &&
    waterContentPercent > 0 &&
    waterContentPercent <= 100
  ) {
    return waterContentPercent;
  }
  return waterContentPercentFromAbv(abvPercent);
}

/** Sugar in grams for the current drink, before rounding. */
function sugarGrams(form: DrinkForm): number {
  if (form.sugarGInput !== null) {
    const typed = parseFloat(form.sugarGInput);
    return Number.isFinite(typed) && typed > 0 ? typed : 0;
  }
  return (form.volumeMl / 100) * form.sugarPer100ml;
}

/**
 * The drink presets and their add/delete actions.
 *
 * Presets live in the settings store, which a manual's live preview does not
 * swap out: it is the user's real, synced settings. Inside a preview the demo
 * therefore starts from the user's presets but adds to and deletes from its
 * own copy, so trying "Save & log" or a long-press delete under the "sample
 * data · not saved" banner leaves the real presets alone.
 */
function useLiquidPresets(): {
  allPresets: LiquidPreset[];
  addPreset: (preset: Omit<LiquidPreset, "id">) => void;
  deletePreset: (id: string) => void;
} {
  const inPreview = useInPreview();
  const stored = useSettingsStore((s) => s.liquidPresets);
  const addStored = useSettingsStore((s) => s.addLiquidPreset);
  const deleteStored = useSettingsStore((s) => s.deleteLiquidPreset);
  const [demoPresets, setDemoPresets] = useState(stored);
  const addDemo = useCallback((preset: Omit<LiquidPreset, "id">) => {
    setDemoPresets((list) => [...list, { ...preset, id: crypto.randomUUID() }]);
  }, []);
  const deleteDemo = useCallback((id: string) => {
    setDemoPresets((list) => list.filter((p) => p.id !== id));
  }, []);
  return inPreview
    ? { allPresets: demoPresets, addPreset: addDemo, deletePreset: deleteDemo }
    : { allPresets: stored, addPreset: addStored, deletePreset: deleteStored };
}

export function PresetTab({ tab }: PresetTabProps) {
  const onLogged = useOnLogged();
  const fid = useFieldId();
  const [form, dispatch] = useReducer(drinkFormReducer, EMPTY_FORM);
  const {
    selectedPresetId,
    volumeMl,
    caffeinePer100ml,
    alcoholPer100ml,
    saltPer100ml,
    sugarPer100ml,
    waterContentPercent,
    beverageName,
    aiLookupUsed,
  } = form;
  const [searchText, setSearchText] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const { allPresets, addPreset, deletePreset } = useLiquidPresets();
  const logDrinkEntry = useLogDrink();
  const { toast } = useToast();
  const showAi = useAuthGate();
  // A disabled tracker is hidden from input forms and its entries are not
  // persisted (see optional-trackers.ts).
  const sugarEnabled = useOptionalTrackerEnabled("sugar");

  // Water progress data
  const settings = useSettings();
  const waterIntake = useIntake("water");
  const waterLimit = settings.waterLimit;
  const waterExtendedBuffer = settings.waterExtendedBuffer;
  const { dailyTotal: waterDailyTotal } = waterIntake;

  // Filter presets by tab prop
  const presets = useMemo(
    () => allPresets.filter((p) => p.tab === tab),
    [allPresets, tab]
  );

  // Determine theme based on tab
  const theme = tab === "coffee" ? CARD_THEMES.caffeine : CARD_THEMES.alcohol;

  // Sugar as it will be logged: integer grams (the column is an integer), and
  // nothing while the tracker is off.
  const sugarG = sugarEnabled ? Math.round(sugarGrams(form)) : 0;

  // What the sugar input shows: the typed text, or the per-100ml figure
  // scaled to the current volume.
  const sugarFieldValue = useMemo(() => {
    if (form.sugarGInput !== null) return form.sugarGInput;
    const derived = (volumeMl / 100) * sugarPer100ml;
    return derived > 0 ? String(Math.round(derived * 10) / 10) : "";
  }, [form.sugarGInput, volumeMl, sugarPer100ml]);

  // Calculated substance amounts for display. Every non-zero solute is listed:
  // this tab has no salt input, so the summary is the only place a preset's
  // sodium is visible before it is logged.
  const calculatedDisplay = useMemo(() => {
    if (volumeMl <= 0) return null;
    const parts: string[] = [];
    if (caffeinePer100ml > 0) {
      parts.push(
        `${Math.round((volumeMl / 100) * caffeinePer100ml)} mg caffeine`
      );
    }
    if (alcoholPer100ml > 0) {
      const stdDrinks = standardDrinksFromAbv(alcoholPer100ml, volumeMl);
      parts.push(
        `${alcoholPer100ml}% ABV (${parseFloat(stdDrinks.toFixed(1))} std drinks)`
      );
    }
    const sodiumMg = Math.round((volumeMl / 100) * saltPer100ml);
    if (sodiumMg > 0) parts.push(`${sodiumMg} mg sodium`);
    if (sugarG > 0) parts.push(`${sugarG} g sugar`);
    return parts.length > 0 ? parts.join(", ") : null;
  }, [volumeMl, caffeinePer100ml, alcoholPer100ml, saltPer100ml, sugarG]);

  // Whether we have anything worth recording besides the volume itself.
  // Salt and sugar count: gating on caffeine/alcohol alone made decaf, herbal
  // tea, alcohol-free beer and salt- or sugar-only presets impossible to log —
  // the button sat permanently disabled with no explanation. Sugar is checked
  // after rounding, as logged: 0.4 g rounds to nothing and records no sugar.
  const hasSubstance =
    caffeinePer100ml > 0 ||
    alcoholPer100ml > 0 ||
    saltPer100ml > 0 ||
    sugarG > 0;

  // Presets to display (collapse if more than 8)
  const visiblePresets = useMemo(() => {
    if (presets.length <= 8 || showAllPresets) return presets;
    return presets.slice(0, 6);
  }, [presets, showAllPresets]);

  const handlePresetTap = useCallback((presetId: string) => {
    if (selectedPresetId === presetId) {
      // Deselect
      dispatch({ type: "reset" });
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    dispatch({ type: "selectPreset", preset });
    setSearchText("");
  }, [selectedPresetId, presets]);

  const handlePointerDown = useCallback((presetId: string) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setDeletePresetId(presetId);
    }, 500);
  }, []);

  const handlePointerUpOrCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePresetClick = useCallback((presetId: string) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    handlePresetTap(presetId);
  }, [handlePresetTap]);

  const resetFields = useCallback(() => {
    dispatch({ type: "reset" });
    setSearchText("");
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletePresetId) return;
    const presetName = presets.find((p) => p.id === deletePresetId)?.name ?? "Preset";
    deletePreset(deletePresetId);
    // If the deleted preset was selected, clear selection
    if (selectedPresetId === deletePresetId) {
      resetFields();
    }
    toast({
      title: "Deleted",
      description: `${presetName} removed`,
    });
    setDeletePresetId(null);
  }, [deletePresetId, deletePreset, presets, selectedPresetId, toast, resetFields]);

  const handleAiLookup = async () => {
    if (!searchText.trim() || isLookingUp) return;
    setIsLookingUp(true);
    let failureMessage = "Try a different name or enter values manually.";
    try {
      const res = await apiFetch("/api/ai/substance-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchText.trim(), type: tab === "coffee" ? "caffeine" : "alcohol" }),
      });
      if (!res.ok) {
        // The route's message is actionable (add a key, retry, enter manually).
        failureMessage = await readAiErrorMessage(res, failureMessage);
        throw new Error(failureMessage);
      }
      const result = (await res.json()) as SubstanceLookupResponse;
      // Replaces the whole drink, sugar and sodium included — a value left
      // over from the previous drink must not ride along with this one.
      dispatch({ type: "lookup", tab, result });
    } catch (cause) {
      console.error("[preset-tab] substance lookup failed", cause);
      toast({
        title: "Lookup failed",
        description: failureMessage,
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  /**
   * Build the `logDrink` payload for the current form state.
   *
   * This used to hand-assemble a composable entry: an explicit water intake
   * plus substances whose `volumeMl` was omitted to suppress the service's
   * implicit auto-water side effect (`...(waterAmount <= 0 && { volumeMl })`).
   * That guard was tautologically dead — `waterAmount` *is* `volumeMl` and
   * logging requires a positive volume — so the substance records were written
   * with no volume at all, leaving nothing to sync a later volume edit against.
   * `logDrink` owns the fluid instead: it derives the one water record from
   * `volumeMl` and stores the volume on the substances as plain data.
   */
  const buildDrink = (): LogDrinkInput => {
    const description =
      beverageName || searchText.trim() || (tab === "coffee" ? "Coffee" : "Drink");
    const presetTag = `preset:${selectedPresetId ?? "manual"}`;

    return {
      volumeMl,
      description,
      waterContentPercent: resolveWaterContentPercent(
        waterContentPercent,
        alcoholPer100ml,
      ),
      waterSource: presetTag,
      groupSource: presetTag,
      ...(caffeinePer100ml > 0 && {
        caffeineMg: Math.round((volumeMl / 100) * caffeinePer100ml),
      }),
      ...(alcoholPer100ml > 0 && { abvPercent: alcoholPer100ml }),
      ...(saltPer100ml > 0 && {
        saltMg: Math.round((volumeMl / 100) * saltPer100ml),
      }),
      ...(sugarG > 0 && { sugarG }),
    };
  };

  const handleLog = async () => {
    if (isSubmitting || volumeMl <= 0 || !hasSubstance) return;
    setIsSubmitting(true);
    try {
      await logDrinkEntry(buildDrink());
      toast({
        title: "Logged",
        description: `${beverageName || searchText.trim() || "Entry"} recorded`,
        variant: "success",
      });
      onLogged();
      // Reset fields
      resetFields();
    } catch (cause) {
      reportSaveError(tab, cause);
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Sugar per 100 ml to store on a new preset, from what the form shows. While
   * the tracker is off the field is hidden, so keep the preset/lookup figure:
   * a preset is configuration (the Settings editor keeps it too), and the
   * sugar only stops being logged, not known.
   */
  const presetSugarPer100ml = (): number => {
    if (!sugarEnabled || form.sugarGInput === null) return sugarPer100ml;
    if (volumeMl <= 0) return 0;
    return Math.round((sugarGrams(form) / volumeMl) * 100 * 100) / 100;
  };

  const handleSaveAndLog = async () => {
    if (!beverageName.trim()) return;
    setIsSubmitting(true);
    const name = beverageName.trim();
    try {
      // Log first. The preset used to be saved before logging, so a failed log
      // still left a new preset behind while the toast blamed the preset.
      try {
        await logDrinkEntry(buildDrink());
      } catch (cause) {
        reportSaveError(tab, cause);
        toast({
          title: "Error",
          description: "Failed to record intake",
          variant: "destructive",
        });
        return;
      }
      const sugarPer100 = presetSugarPer100ml();
      try {
        addPreset({
          name,
          tab,
          defaultVolumeMl: volumeMl,
          waterContentPercent: resolveWaterContentPercent(
            waterContentPercent,
            alcoholPer100ml,
          ),
          ...(caffeinePer100ml > 0 && { caffeinePer100ml }),
          ...(alcoholPer100ml > 0 && { alcoholPer100ml }),
          ...(saltPer100ml > 0 && { saltPer100ml }),
          ...(sugarPer100 > 0 && { sugarPer100ml: sugarPer100 }),
          isDefault: false,
          source: aiLookupUsed ? "ai" : "manual",
        });
      } catch (cause) {
        console.error("[preset-tab] failed to save preset", cause);
        toast({
          title: "Logged",
          description: `${name} recorded, but the preset could not be saved`,
          variant: "destructive",
        });
        onLogged();
        resetFields();
        return;
      }
      toast({
        title: "Saved & Logged",
        description: `${name} saved as preset and logged`,
        variant: "success",
      });
      onLogged();
      // Reset
      resetFields();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Primary substance label for the per-100ml input
  const primarySubstanceLabel =
    tab === "coffee" ? "per 100ml (mg caffeine)" : "% ABV";

  return (
    <div className="flex flex-col gap-2.5">
      <SegmentBar
        value={waterDailyTotal}
        limit={waterLimit}
        buffer={waterExtendedBuffer}
        domain="water"
        aria-label="Water intake today, as a percentage of the daily limit"
      />

      {/* 1. Preset Grid */}
      {presets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {tab} presets yet.{" "}
          {showAi
            ? "Use AI lookup or enter values manually to create one."
            : "Enter values manually to create one."}
        </p>
      ) : (
        <div className="wc-pgrid">
          {visiblePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selectedPresetId === preset.id}
              onClick={() => handlePresetClick(preset.id)}
              onPointerDown={() => handlePointerDown(preset.id)}
              onPointerUp={handlePointerUpOrCancel}
              onPointerCancel={handlePointerUpOrCancel}
              onPointerLeave={handlePointerUpOrCancel}
              className="touch-manipulation"
            >
              <b>{preset.name}</b>
              <span>{preset.defaultVolumeMl}ml</span>
            </button>
          ))}
          {presets.length > 8 && !showAllPresets && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllPresets(true)}
              className="col-span-2 text-xs text-muted-foreground"
            >
              Show all ({presets.length})
            </Button>
          )}
        </div>
      )}

      {/* 2. AI Text Input — only when signed in */}
      {showAi && (
        <div className="relative">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={tab === "coffee" ? "Search beverage..." : "Search drink..."}
            aria-label="Search beverages for AI lookup"
            disabled={isLookingUp}
            className="pr-10"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAiLookup();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleAiLookup}
            disabled={!searchText.trim() || isLookingUp}
            aria-label="Look up substance content"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-auto w-auto p-1 rounded-md text-muted-foreground hover:bg-transparent hover:text-foreground disabled:cursor-not-allowed"
          >
            {isLookingUp ? (
              <Spinner className="size-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </Button>
        </div>
      )}

      {/* Name Input — always visible so signed-out users can label entries */}
      <Input
        value={beverageName}
        onChange={(e) => dispatch({ type: "setName", value: e.target.value })}
        placeholder={tab === "coffee" ? "e.g. Espresso, Latte" : "e.g. Beer, Whisky"}
        aria-label={`${tab} name`}
      />

      {/* 3. Volume and Substance Fields */}
      <div className="grid grid-cols-2 gap-2">
        <FieldScope domain="water">
          <Label htmlFor={fid(`${tab}-volume`)} className="text-xs text-muted-foreground">
            <Pip />
            Volume (ml)
          </Label>
          <Input
            id={fid(`${tab}-volume`)}
            type="number"
            value={volumeMl || ""}
            onChange={(e) =>
              dispatch({ type: "setVolume", volumeMl: Number(e.target.value) || 0 })
            }
            className="num"
            min={0}
          />
        </FieldScope>
        <div>
          <Label
            htmlFor={fid(`${tab}-per100ml`)}
            className="text-xs text-muted-foreground"
          >
            <Pip />
            {primarySubstanceLabel}
          </Label>
          <Input
            id={fid(`${tab}-per100ml`)}
            type="number"
            value={(tab === "coffee" ? caffeinePer100ml : alcoholPer100ml) || ""}
            onChange={(e) =>
              dispatch({
                type: "setPrimary",
                tab,
                value: Number(e.target.value) || 0,
              })
            }
            className="num"
            min={0}
            step={tab === "alcohol" ? "0.5" : "1"}
          />
        </div>
      </div>

      {/* Optional sugar content — only while the sugar tracker is on */}
      {sugarEnabled && (
        <FieldScope domain="sugar" className="space-y-1">
          <Label
            htmlFor={fid(`${tab}-sugar`)}
            className="text-xs text-muted-foreground"
          >
            <Pip />
            Sugar (g) — optional
          </Label>
          <Input
            id={fid(`${tab}-sugar`)}
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="g"
            value={sugarFieldValue}
            onChange={(e) => dispatch({ type: "setSugar", value: e.target.value })}
            className="num"
          />
        </FieldScope>
      )}

      {/* 4. Calculated Amount Display */}
      <div>
        {calculatedDisplay ? (
          <p className={cn("num text-sm font-semibold", theme.iconColor)}>
            {calculatedDisplay}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter volume and concentration
          </p>
        )}
      </div>

      {/* 5. Action Buttons */}
      <div className="space-y-2">
        <Button
          variant="default"
          onClick={handleLog}
          disabled={isSubmitting || volumeMl <= 0 || !hasSubstance}
          className="w-full"
        >
          <Check className="w-5 h-5" />
          {isSubmitting ? "Logging..." : "Log Entry"}
        </Button>
        {volumeMl > 0 && !hasSubstance && (
          <p className="text-xs text-muted-foreground text-center">
            {sugarEnabled
              ? "Add a caffeine, ABV, sodium or sugar amount"
              : "Add a caffeine, ABV or sodium amount"}{" "}
            — or log a plain drink from the Water or Beverage tab.
          </p>
        )}
        {showAi && beverageName.trim() && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveAndLog}
              disabled={
                isSubmitting ||
                volumeMl <= 0 ||
                !hasSubstance ||
                !aiLookupUsed
              }
              className="w-full"
            >
              {isSubmitting ? "Saving..." : "Save as preset & log"}
            </Button>
            {!aiLookupUsed && (
              <p className="text-xs text-muted-foreground text-center">
                Use AI lookup to populate substance data
              </p>
            )}
          </>
        )}
      </div>

      {/* Delete Preset Confirmation Dialog */}
      <AlertDialog open={deletePresetId !== null} onOpenChange={(open) => { if (!open) setDeletePresetId(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {presets.find((p) => p.id === deletePresetId)?.name ?? "preset"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This preset will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
