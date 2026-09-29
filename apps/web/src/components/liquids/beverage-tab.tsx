"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Progress } from "@intake/ui/progress";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@intake/ui/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";
import {
  useAddComposableEntry,
  type ComposableEntryInput,
} from "@/hooks/use-composable-entry";
import { computeTwoStageProgress } from "@intake/core/progress";
import { reportSaveError } from "@/lib/db-recovery";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { formatDateTime } from "@/lib/date-utils";
import { useFieldId, useOnLogged } from "@/components/log-form-scope";

/** Parse the optional sugar field into rounded grams (0 when empty/invalid). */
function parseSugarGrams(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

// The Beverage tab only logs volume (and optional sugar). Drinks with alcohol
// or caffeine belong on their own tabs, which also write a substance record.
const ALCOHOL_NAME_PATTERN =
  /\b(beer|ipa|lager|ale|stout|cider|wine|prosecco|champagne|whiske?y|vodka|gin|rum|tequila|brandy|cocktail|mule|margarita|spritz|sake|alcohol)\b/i;
const CAFFEINE_NAME_PATTERN =
  /\b(coffee|espresso|latte|cappuccino|americano|mocha|macchiato|flat white|tea|matcha|chai|caffeine|energy drink|cola|red bull|monster)\b/i;

// Names that contain a keyword above but are not alcoholic / caffeinated
// ("ginger ale", "root beer", "decaf latte"): these belong on this tab.
const NON_ALCOHOLIC_PATTERN =
  /\b(ginger (ale|beer)|root beer|non-?alcoholic|alcohol-?free|zero|0(\.0)?\s?%)/i;
const CAFFEINE_FREE_PATTERN =
  /\b(decaf(feinated)?|caffeine-?free|herbal|rooibos|chamomile|peppermint)\b/i;

/** Which substance tab a beverage name suggests, if any. */
function suggestedSubstanceTab(name: string): "Alcohol" | "Coffee" | null {
  if (ALCOHOL_NAME_PATTERN.test(name) && !NON_ALCOHOLIC_PATTERN.test(name)) {
    return "Alcohol";
  }
  if (CAFFEINE_NAME_PATTERN.test(name) && !CAFFEINE_FREE_PATTERN.test(name)) {
    return "Coffee";
  }
  return null;
}

const theme = CARD_THEMES.water;
const unit = "ml";

export function BeverageTab() {
  const onLogged = useOnLogged();
  const fid = useFieldId();
  const settings = useSettings();
  const waterIncrement = settings.waterIncrement;

  const waterLimit = settings.waterLimit;
  const waterExtendedBuffer = settings.waterExtendedBuffer;
  const waterIntake = useIntake("water");

  const { dailyTotal } = waterIntake;
  const progress = computeTwoStageProgress(
    dailyTotal,
    waterLimit,
    waterExtendedBuffer
  );

  const [pendingAmount, setPendingAmount] = useState(waterIncrement);
  // Optional custom time / note from the "tap to edit" dialog, committed by
  // the next Log Beverage and cleared after it.
  const [pendingTimestamp, setPendingTimestamp] = useState<number | undefined>();
  const [pendingNote, setPendingNote] = useState<string | undefined>();
  const [beverageName, setBeverageName] = useState("");
  const [sugarG, setSugarG] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  // Synchronous in-flight guard (see WaterTab).
  const inFlightRef = useRef(false);

  const { toast } = useToast();
  const substanceTab = suggestedSubstanceTab(beverageName);
  // A disabled tracker is hidden from input forms and its entries are not
  // persisted (see optional-trackers.ts).
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const addEntry = useAddComposableEntry();

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + waterIncrement);
  }, [waterIncrement]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(waterIncrement, prev - waterIncrement));
  }, [waterIncrement]);

  // Log the beverage — when a sugar amount is present, the drink volume and
  // sugar are written together as one grouped composable entry; otherwise a
  // plain water record.
  const logBeverage = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      const source = beverageName.trim()
        ? `beverage:${beverageName.trim()}`
        : "beverage";
      const sugar = sugarEnabled ? parseSugarGrams(sugarG) : 0;
      if (sugar > 0) {
        const intakes: ComposableEntryInput["intakes"] = [
          { type: "water", amount, source, ...(note ? { note } : {}) },
          { type: "sugar", amount: sugar, source: "manual:sugar" },
        ];
        await addEntry(
          { intakes, groupSource: "manual_beverage_entry" },
          timestamp
        );
      } else {
        await waterIntake.addRecord(amount, source, timestamp, note);
      }
    },
    [beverageName, sugarG, sugarEnabled, addEntry, waterIntake]
  );

  const handleConfirm = useCallback(async () => {
    if (pendingAmount <= 0 || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      await logBeverage(pendingAmount, pendingTimestamp, pendingNote);
      toast({
        title: `Added ${formatAmount(pendingAmount, unit)}`,
        description: pendingTimestamp
          ? "Beverage intake recorded for earlier time"
          : "Beverage intake recorded",
        variant: "success",
      });
      onLogged();
      setPendingAmount(waterIncrement);
      setPendingTimestamp(undefined);
      setPendingNote(undefined);
      setBeverageName("");
      setSugarG("");
    } catch (e) {
      reportSaveError("beverage", e);
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [pendingAmount, pendingTimestamp, pendingNote, logBeverage, toast, waterIncrement, onLogged]);

  // "Tap to edit" only edits the pending entry; Log Beverage is the single
  // commit, so the name/sugar reset happens in exactly one place.
  const handleManualSubmit = useCallback(
    (amount: number, timestamp?: number, note?: string) => {
      setPendingAmount(amount);
      setPendingTimestamp(timestamp);
      setPendingNote(note);
      setShowManualInput(false);
    },
    []
  );

  return (
    <>
      {/* Water Progress Bar */}
      <div className="mb-4">
        <Progress
          value={progress.isOverExtended ? 100 : progress.primaryPct}
          extendedValue={progress.isOverExtended ? 0 : progress.extendedPct}
          targetMarkerPct={progress.isOverExtended ? 0 : progress.targetPct}
          className="h-3"
          indicatorClassName={
            progress.isOverExtended ? theme.progressOverLimit : theme.progressGradient
          }
          extendedIndicatorClassName={theme.progressExtended}
          aria-label="Water intake today, as a percentage of the daily limit"
        />
      </div>

      {/* Name Input */}
      <Input
        placeholder="e.g. Juice, Smoothie"
        value={beverageName}
        onChange={(e) => setBeverageName(e.target.value)}
        className={cn("h-10", substanceTab ? "mb-1" : "mb-3")}
      />
      {substanceTab && (
        <p
          role="status"
          className="text-xs text-amber-700 dark:text-amber-400 mb-3"
        >
          {substanceTab === "Alcohol"
            ? "This looks like an alcoholic drink. Use the Alcohol tab to also track alcohol; this tab logs only the volume."
            : "This looks like a caffeinated drink. Use the Coffee tab to also track caffeine; this tab logs only the volume."}
        </p>
      )}

      {/* Quick-set size buttons */}
      <div className="flex gap-2 mb-3">
        {[40, 200, 330, 500].map((size) => (
          <Button
            key={size}
            variant="outline"
            size="sm"
            onClick={() => setPendingAmount(size)}
            className={cn(
              "flex-1",
              pendingAmount === size && theme.activeToggle
            )}
          >
            {size}
          </Button>
        ))}
      </div>

      {/* Input Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Decrement Button */}
        <Button
          variant="outline"
          size="icon-lg"
          onClick={handleDecrement}
          disabled={pendingAmount <= waterIncrement || isSubmitting}
          className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
          aria-label="Decrease beverage amount"
        >
          <Minus className="w-6 h-6" />
        </Button>

        {/* Center Value - Clickable for manual input */}
        <button
          onClick={() => setShowManualInput(true)}
          disabled={isSubmitting}
          className={cn(
            "flex-1 py-4 px-6 rounded-xl transition-all",
            "flex flex-col items-center justify-center gap-1",
            "active:scale-95",
            theme.inputBg
          )}
        >
          <span className={cn("text-3xl font-bold num", theme.inputText)}>
            +{formatAmount(pendingAmount, unit)}
          </span>
          <span className="text-xs text-muted-foreground">
            {pendingTimestamp !== undefined &&
              `${formatDateTime(pendingTimestamp)} · `}
            {pendingNote !== undefined && "with note · "}
            tap to edit
          </span>
        </button>

        {/* Increment Button */}
        <Button
          variant="outline"
          size="icon-lg"
          onClick={handleIncrement}
          disabled={isSubmitting}
          className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
          aria-label="Increase beverage amount"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Optional sugar content */}
      {sugarEnabled && (
        <div className="mt-4 space-y-1">
          <Label htmlFor={fid("beverage-sugar")} className="text-sm">
            Sugar (g){" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={fid("beverage-sugar")}
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="g"
            value={sugarG}
            onChange={(e) => setSugarG(e.target.value)}
          />
        </div>
      )}

      {/* Confirm Button */}
      <Button
        onClick={handleConfirm}
        disabled={isSubmitting || pendingAmount <= 0}
        className={cn("w-full mt-4 h-12 text-base font-semibold", theme.buttonBg)}
      >
        <Check className="w-5 h-5 mr-2" />
        {isSubmitting ? "Logging..." : "Log Beverage"}
      </Button>

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type="water"
        currentValue={pendingAmount}
        initialTimestamp={pendingTimestamp}
        initialNote={pendingNote}
        onSubmit={handleManualSubmit}
        title="Enter Beverage Amount"
        description="Set the amount (and optionally the time or a note), then log the beverage."
        submitLabel="Set Amount"
      />
    </>
  );
}
