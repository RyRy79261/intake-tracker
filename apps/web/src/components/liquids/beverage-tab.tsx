"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { SegmentBar } from "@/components/home/module-card";
import { Minus, Plus, Check } from "lucide-react";
import { FieldScope, Pip } from "@/components/domain-scope";
import { formatAmount } from "@/lib/utils";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@intake/ui/use-toast";
import { useIntake } from "@/hooks/use-intake-queries";
import {
  useAddComposableEntry,
  type ComposableEntryInput,
} from "@/hooks/use-composable-entry";
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
    <div className="flex flex-col gap-2.5">
      <SegmentBar
        value={dailyTotal}
        limit={waterLimit}
        buffer={waterExtendedBuffer}
        aria-label="Water intake today, as a percentage of the daily limit"
      />

      <Input
        placeholder="e.g. Juice, Smoothie"
        value={beverageName}
        onChange={(e) => setBeverageName(e.target.value)}
      />
      {substanceTab && (
        <p
          role="status"
          className="border-l-2 border-sodium pl-2 text-[0.8125rem] text-sodium"
        >
          {substanceTab === "Alcohol"
            ? "This looks like an alcoholic drink. Use the Alcohol tab to also track alcohol; this tab logs only the volume."
            : "This looks like a caffeinated drink. Use the Coffee tab to also track caffeine; this tab logs only the volume."}
        </p>
      )}

      <div className="wc-qchips">
        {[40, 200, 330, 500].map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={pendingAmount === size}
            onClick={() => setPendingAmount(size)}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="wc-lstep">
        <button
          type="button"
          className="rb"
          onClick={handleDecrement}
          disabled={pendingAmount <= waterIncrement || isSubmitting}
          aria-label="Decrease beverage amount"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          type="button"
          className="amt"
          onClick={() => setShowManualInput(true)}
          disabled={isSubmitting}
        >
          <b>+{formatAmount(pendingAmount, unit)}</b>
          <small>
            {pendingTimestamp !== undefined &&
              `${formatDateTime(pendingTimestamp)} · `}
            {pendingNote !== undefined && "with note · "}
            tap to edit
          </small>
        </button>
        <button
          type="button"
          className="rb"
          onClick={handleIncrement}
          disabled={isSubmitting}
          aria-label="Increase beverage amount"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {sugarEnabled && (
        <FieldScope domain="sugar" className="space-y-1">
          <Label htmlFor={fid("beverage-sugar")} className="text-[0.8125rem] text-muted-foreground">
            <Pip />
            Sugar (g) (optional)
          </Label>
          <Input
            id={fid("beverage-sugar")}
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="g"
            value={sugarG}
            onChange={(e) => setSugarG(e.target.value)}
            className="num"
          />
        </FieldScope>
      )}

      <Button
        onClick={handleConfirm}
        disabled={isSubmitting || pendingAmount <= 0}
        className="w-full"
      >
        <Check className="w-5 h-5" />
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
    </div>
  );
}
