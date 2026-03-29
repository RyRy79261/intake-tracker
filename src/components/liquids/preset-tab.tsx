"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { useAddComposableEntry, type ComposableEntryInput } from "@/hooks/use-composable-entry";
import { useToast } from "@/hooks/use-toast";
import type { LiquidPreset } from "@/lib/constants";

interface PresetTabProps {
  tab: "coffee" | "alcohol" | "beverage";
}

export function PresetTab({ tab }: PresetTabProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [volumeMl, setVolumeMl] = useState<number>(0);
  const [caffeinePer100ml, setCaffeinePer100ml] = useState<number>(0);
  const [alcoholPer100ml, setAlcoholPer100ml] = useState<number>(0);
  const [saltPer100ml, setSaltPer100ml] = useState<number>(0);
  const [waterContentPercent, setWaterContentPercent] = useState<number>(100);
  const [beverageName, setBeverageName] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiLookupUsed, setAiLookupUsed] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);

  const allPresets = useSettingsStore((s) => s.liquidPresets);
  const addPreset = useSettingsStore((s) => s.addLiquidPreset);
  const addEntry = useAddComposableEntry();
  const { toast } = useToast();

  // Filter presets by tab prop
  const presets = useMemo(
    () => allPresets.filter((p) => p.tab === tab),
    [allPresets, tab]
  );

  // Determine theme based on tab
  const theme =
    tab === "coffee"
      ? CARD_THEMES.caffeine
      : tab === "alcohol"
        ? CARD_THEMES.alcohol
        : CARD_THEMES.water;

  // AI lookup type mapping
  const aiLookupType = tab === "coffee" ? "caffeine" : tab === "alcohol" ? "alcohol" : "caffeine";

  // Calculated substance amounts for display
  const calculatedDisplay = useMemo(() => {
    if (volumeMl <= 0) return null;
    const parts: string[] = [];
    if (caffeinePer100ml > 0) {
      parts.push(
        `${Math.round((volumeMl / 100) * caffeinePer100ml)} mg caffeine`
      );
    }
    if (alcoholPer100ml > 0) {
      const stdDrinks = volumeMl * (alcoholPer100ml / 100) * 0.789 / 14;
      parts.push(
        `${alcoholPer100ml}% ABV (${parseFloat(stdDrinks.toFixed(1))} std drinks)`
      );
    }
    if (parts.length === 0 && saltPer100ml > 0) {
      parts.push(
        `${Math.round((volumeMl / 100) * saltPer100ml)} mg salt`
      );
    }
    return parts.length > 0 ? parts.join(", ") : null;
  }, [volumeMl, caffeinePer100ml, alcoholPer100ml, saltPer100ml]);

  // Whether we have any loggable substance
  const hasSubstance = caffeinePer100ml > 0 || alcoholPer100ml > 0;

  // Presets to display (collapse if more than 8)
  const visiblePresets = useMemo(() => {
    if (presets.length <= 8 || showAllPresets) return presets;
    return presets.slice(0, 6);
  }, [presets, showAllPresets]);

  const selectPreset = (preset: LiquidPreset) => {
    setVolumeMl(preset.defaultVolumeMl);
    setCaffeinePer100ml(preset.caffeinePer100ml ?? 0);
    setAlcoholPer100ml(preset.alcoholPer100ml ?? 0);
    setSaltPer100ml(preset.saltPer100ml ?? 0);
    setWaterContentPercent(preset.waterContentPercent);
    setBeverageName(preset.name);
    setSearchText("");
  };

  const handlePresetTap = (presetId: string) => {
    if (selectedPresetId === presetId) {
      // Deselect
      setSelectedPresetId(null);
      setVolumeMl(0);
      setCaffeinePer100ml(0);
      setAlcoholPer100ml(0);
      setSaltPer100ml(0);
      setWaterContentPercent(100);
      setBeverageName("");
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    selectPreset(preset);
  };

  const handleAiLookup = async () => {
    if (!searchText.trim() || isLookingUp) return;
    setIsLookingUp(true);
    setSelectedPresetId(null);
    try {
      const res = await fetch("/api/ai/substance-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchText.trim(), type: aiLookupType }),
      });
      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json();
      // Map AI response substancePer100ml to correct per-100ml field based on tab
      if (tab === "coffee") {
        setCaffeinePer100ml(data.substancePer100ml ?? 0);
        setAlcoholPer100ml(0);
      } else if (tab === "alcohol") {
        setAlcoholPer100ml(data.substancePer100ml ?? 0);
        setCaffeinePer100ml(0);
      } else {
        // beverage tab: could be either, default to caffeine
        setCaffeinePer100ml(data.substancePer100ml ?? 0);
      }
      setVolumeMl(data.defaultVolumeMl);
      setBeverageName(data.beverageName);
      setWaterContentPercent(data.waterContentPercent ?? 100);
      setAiLookupUsed(true);
    } catch {
      toast({
        title: "Lookup failed",
        description: "Try a different name or enter values manually.",
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const buildComposableEntry = (): ComposableEntryInput => {
    const description =
      beverageName ||
      searchText.trim() ||
      (tab === "coffee" ? "Coffee" : tab === "alcohol" ? "Drink" : "Beverage");

    const entry: ComposableEntryInput = {
      groupSource: `preset:${selectedPresetId ?? "manual"}`,
    };

    // Water intake from waterContentPercent
    const waterAmount = Math.round(
      (volumeMl * waterContentPercent) / 100
    );
    const intakes: ComposableEntryInput["intakes"] = [];
    if (waterAmount > 0) {
      intakes.push({
        type: "water",
        amount: waterAmount,
        source: `preset:${selectedPresetId ?? "manual"}`,
      });
    }
    // Salt intake
    if (saltPer100ml > 0) {
      intakes.push({
        type: "salt",
        amount: Math.round((volumeMl / 100) * saltPer100ml),
      });
    }
    if (intakes.length > 0) {
      entry.intakes = intakes;
    }

    // Build substance records
    const substances: Array<{
      type: "caffeine" | "alcohol";
      amountMg?: number;
      amountStandardDrinks?: number;
      volumeMl?: number;
      description: string;
    }> = [];

    if (caffeinePer100ml > 0) {
      substances.push({
        type: "caffeine",
        amountMg: Math.round((volumeMl / 100) * caffeinePer100ml),
        volumeMl,
        description,
      });
    }
    if (alcoholPer100ml > 0) {
      const stdDrinks = volumeMl * (alcoholPer100ml / 100) * 0.789 / 14;
      substances.push({
        type: "alcohol",
        amountStandardDrinks: parseFloat(stdDrinks.toFixed(1)),
        volumeMl,
        description,
      });
    }

    // If only 1 substance: use singular field for backward compat
    if (substances.length === 1 && substances[0]) {
      entry.substance = substances[0];
    } else if (substances.length > 1) {
      entry.substances = substances;
    }

    return entry;
  };

  const handleLog = async () => {
    if (isSubmitting || volumeMl <= 0 || !hasSubstance) return;
    setIsSubmitting(true);
    try {
      const entry = buildComposableEntry();
      await addEntry(entry);
      toast({
        title: "Logged",
        description: `${beverageName || searchText.trim() || "Entry"} recorded`,
        variant: "success",
      });
      // Reset fields
      resetFields();
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndLog = async () => {
    if (!beverageName.trim()) return;
    setIsSubmitting(true);
    try {
      addPreset({
        name: beverageName.trim(),
        tab,
        defaultVolumeMl: volumeMl,
        waterContentPercent,
        ...(caffeinePer100ml > 0 && { caffeinePer100ml }),
        ...(alcoholPer100ml > 0 && { alcoholPer100ml }),
        ...(saltPer100ml > 0 && { saltPer100ml }),
        isDefault: false,
        source: aiLookupUsed ? "ai" : "manual",
      });
      const entry = buildComposableEntry();
      await addEntry(entry);
      toast({
        title: "Saved & Logged",
        description: `${beverageName.trim()} saved as preset and logged`,
        variant: "success",
      });
      // Reset
      resetFields();
    } catch {
      toast({
        title: "Error",
        description: "Failed to save preset",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFields = () => {
    setVolumeMl(0);
    setCaffeinePer100ml(0);
    setAlcoholPer100ml(0);
    setSaltPer100ml(0);
    setWaterContentPercent(100);
    setBeverageName("");
    setSearchText("");
    setSelectedPresetId(null);
    setAiLookupUsed(false);
  };

  // Primary substance label for the per-100ml input
  const primarySubstanceLabel =
    tab === "coffee" ? "per 100ml (mg caffeine)" : tab === "alcohol" ? "% ABV" : "per 100ml (mg)";

  return (
    <>
      {/* 1. Preset Grid */}
      {presets.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">
          No {tab} presets yet. Use AI lookup or enter values manually to
          create one.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {visiblePresets.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => handlePresetTap(preset.id)}
              className={cn(
                "min-h-[40px] w-full",
                selectedPresetId === preset.id && theme.activeToggle
              )}
            >
              <span className="flex items-center justify-between w-full">
                <span className="text-sm font-semibold">{preset.name}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.defaultVolumeMl}ml
                </span>
              </span>
            </Button>
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

      {/* 2. AI Text Input */}
      <div className="relative mb-3">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={
            tab === "coffee"
              ? "Search beverage..."
              : tab === "alcohol"
                ? "Search drink..."
                : "Search beverage..."
          }
          aria-label="Search beverages for AI lookup"
          disabled={isLookingUp}
          className="h-10 pr-10"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAiLookup();
            }
          }}
        />
        <button
          type="button"
          onClick={handleAiLookup}
          disabled={!searchText.trim() || isLookingUp}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Look up substance content"
        >
          {isLookingUp ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 3. Volume and Substance Fields */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div>
          <Label htmlFor={`${tab}-volume`} className="text-xs text-muted-foreground">
            Volume (ml)
          </Label>
          <Input
            id={`${tab}-volume`}
            type="number"
            value={volumeMl || ""}
            onChange={(e) => {
              setVolumeMl(Number(e.target.value) || 0);
              setSelectedPresetId(null);
            }}
            className="h-10"
            min={0}
          />
        </div>
        <div>
          <Label
            htmlFor={`${tab}-per100ml`}
            className="text-xs text-muted-foreground"
          >
            {primarySubstanceLabel}
          </Label>
          <Input
            id={`${tab}-per100ml`}
            type="number"
            value={
              tab === "coffee"
                ? caffeinePer100ml || ""
                : tab === "alcohol"
                  ? alcoholPer100ml || ""
                  : caffeinePer100ml || ""
            }
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              if (tab === "coffee") setCaffeinePer100ml(val);
              else if (tab === "alcohol") setAlcoholPer100ml(val);
              else setCaffeinePer100ml(val);
              setSelectedPresetId(null);
            }}
            className="h-10"
            min={0}
            step={tab === "alcohol" ? "0.5" : "1"}
          />
        </div>
      </div>

      {/* 4. Calculated Amount Display */}
      <div className="mb-4">
        {calculatedDisplay ? (
          <p className={cn("text-sm font-semibold", theme.iconColor)}>
            {calculatedDisplay}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter volume and concentration
          </p>
        )}
      </div>

      {/* 5. Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={handleLog}
          disabled={isSubmitting || volumeMl <= 0 || !hasSubstance}
          className={cn("h-12 w-full border", theme.outlineBorder)}
        >
          {isSubmitting ? "Logging..." : "Log Entry"}
        </Button>
        <Button
          variant="default"
          onClick={handleSaveAndLog}
          disabled={
            isSubmitting ||
            volumeMl <= 0 ||
            !hasSubstance ||
            !beverageName.trim()
          }
          className={cn("h-12 w-full", theme.buttonBg)}
        >
          {isSubmitting ? "Saving..." : "Save & Log"}
        </Button>
      </div>
    </>
  );
}
