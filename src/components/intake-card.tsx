"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, Check } from "lucide-react";
import { cn, formatAmount, getLiquidTypeLabel } from "@/lib/utils";
import { LIQUID_TYPE_OPTIONS, COFFEE_PRESETS } from "@/lib/constants";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { ManualInputDialog } from "./manual-input-dialog";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useDeleteIntake, useRecentIntakeRecords, useUpdateIntake } from "@/hooks/use-intake-queries";
import { type IntakeRecord } from "@/lib/db";

interface IntakeCardProps {
  type: "water" | "salt";
  dailyTotal: number;    // Primary - since day start (for budget tracking)
  rollingTotal: number;  // Secondary - rolling 24h (for safety/pacing)
  limit: number;
  increment: number;
  onConfirm: (amount: number, timestamp?: number, note?: string) => Promise<void>;
  onConfirmWithSource?: (amount: number, source: string, timestamp?: number, note?: string) => Promise<void>;
  isLoading?: boolean;
}

export function IntakeCard({
  type,
  dailyTotal,
  rollingTotal,
  limit,
  increment,
  onConfirm,
  onConfirmWithSource,
  isLoading = false,
}: IntakeCardProps) {
  const settings = useSettings();
  const [pendingAmount, setPendingAmount] = useState(increment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [liquidType, setLiquidType] = useState<"water" | "juice" | "coffee" | "food">("water");

  // Coffee inline state
  const [selectedCoffeeType, setSelectedCoffeeType] = useState(settings.coffeeDefaultType);
  const [coffeeOtherName, setCoffeeOtherName] = useState("");
  const [coffeeOtherMl, setCoffeeOtherMl] = useState("60");

  // Juice inline state
  const [juiceName, setJuiceName] = useState("");

  // Food inline state
  const [foodNote, setFoodNote] = useState("");

  const { toast } = useToast();
  const deleteMutation = useDeleteIntake();
  const updateMutation = useUpdateIntake();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, `${CARD_THEMES[type].label} entry removed`);

  // Extra edit field (amount is record-specific)
  const [editAmount, setEditAmount] = useState("");

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<IntakeRecord>({
    onOpen: (record) => setEditAmount(record.amount.toString()),
    buildUpdates: (timestamp, note) => {
      const newAmount = parseInt(editAmount, 10);
      if (isNaN(newAmount) || newAmount <= 0) {
        toast({ title: "Invalid amount", variant: "destructive" });
        return null;
      }
      return { amount: newAmount, timestamp, note };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  // When coffee type changes, seed the pending amount with the preset value
  const handleCoffeeTypeSelect = useCallback((coffeeValue: string) => {
    setSelectedCoffeeType(coffeeValue);
    const preset = COFFEE_PRESETS.find((p) => p.value === coffeeValue);
    if (preset && preset.waterMl > 0) {
      setPendingAmount(preset.waterMl);
    }
  }, []);

  // Reset type-specific fields when switching liquid type
  useEffect(() => {
    if (liquidType === "coffee") {
      setSelectedCoffeeType(settings.coffeeDefaultType);
      setCoffeeOtherName("");
      setCoffeeOtherMl("60");
      const preset = COFFEE_PRESETS.find((p) => p.value === settings.coffeeDefaultType);
      if (preset && preset.waterMl > 0) {
        setPendingAmount(preset.waterMl);
      }
    } else if (liquidType === "water") {
      setPendingAmount(increment);
    } else {
      setJuiceName("");
      setFoodNote("");
    }
    // Only run when liquidType changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liquidType]);

  // Fetch recent records using TanStack Query
  const { data: recentRecords } = useRecentIntakeRecords(type);

  const theme = CARD_THEMES[type];
  const Icon = theme.icon;
  const unit = type === "water" ? "ml" : "mg";

  // Use daily total for budget tracking (primary metric)
  const progressPercent = limit > 0 ? Math.min((dailyTotal / limit) * 100, 100) : 0;
  const isOverLimit = limit > 0 && dailyTotal > limit;
  const wouldExceedLimit = limit > 0 && dailyTotal + pendingAmount > limit;

  const handleIncrement = useCallback(() => {
    setPendingAmount((prev) => prev + increment);
  }, [increment]);

  const handleDecrement = useCallback(() => {
    setPendingAmount((prev) => Math.max(increment, prev - increment));
  }, [increment]);

  // Build the source string for the current liquid type
  const buildSource = useCallback((): string | null => {
    if (liquidType === "water") return null;
    if (liquidType === "juice") {
      const name = juiceName.trim();
      return name ? `juice:${name}` : "juice";
    }
    if (liquidType === "coffee") {
      if (selectedCoffeeType === "other") {
        const name = coffeeOtherName.trim() || "other";
        return `coffee:${name}`;
      }
      return `coffee:${selectedCoffeeType}`;
    }
    if (liquidType === "food") {
      const note = foodNote.trim();
      return note ? `food:${note}` : "food";
    }
    return null;
  }, [liquidType, juiceName, selectedCoffeeType, coffeeOtherName, foodNote]);

  // Get the display label for the current liquid type
  const getTypeLabel = useCallback((): string => {
    if (liquidType === "water") return theme.label;
    return liquidType.charAt(0).toUpperCase() + liquidType.slice(1);
  }, [liquidType, theme.label]);

  // For coffee "other", use the custom ml value for the pending amount
  const effectiveAmount = useCallback((): number => {
    if (liquidType === "coffee" && selectedCoffeeType === "other") {
      const customMl = parseInt(coffeeOtherMl, 10);
      return isNaN(customMl) || customMl <= 0 ? 0 : customMl;
    }
    return pendingAmount;
  }, [liquidType, selectedCoffeeType, coffeeOtherMl, pendingAmount]);

  const handleConfirm = useCallback(async () => {
    const amount = effectiveAmount();
    if (amount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const source = buildSource();
      if (source && onConfirmWithSource) {
        await onConfirmWithSource(amount, source);
      } else {
        await onConfirm(amount);
      }
      toast({
        title: `Added ${formatAmount(amount, unit)}`,
        description: `${getTypeLabel()} intake recorded`,
        variant: "success",
      });
      // Reset amount: for coffee, re-seed from preset; otherwise use increment
      if (liquidType === "coffee") {
        const preset = COFFEE_PRESETS.find((p) => p.value === selectedCoffeeType);
        setPendingAmount(preset && preset.waterMl > 0 ? preset.waterMl : increment);
        setCoffeeOtherName("");
      } else {
        setPendingAmount(increment);
      }
      if (liquidType === "juice") setJuiceName("");
      if (liquidType === "food") setFoodNote("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [effectiveAmount, isSubmitting, buildSource, onConfirmWithSource, onConfirm, toast, unit, getTypeLabel, liquidType, selectedCoffeeType, increment]);

  const handleManualSubmit = useCallback(
    async (amount: number, timestamp?: number, note?: string) => {
      setIsSubmitting(true);
      try {
        const source = buildSource();
        if (source && onConfirmWithSource) {
          await onConfirmWithSource(amount, source, timestamp, note);
        } else {
          await onConfirm(amount, timestamp, note);
        }
        toast({
          title: `Added ${formatAmount(amount, unit)}`,
          description: timestamp
            ? `${getTypeLabel()} intake recorded for earlier time`
            : `${getTypeLabel()} intake recorded`,
          variant: "success",
        });
        setShowManualInput(false);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to record intake",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onConfirm, onConfirmWithSource, toast, unit, getTypeLabel, buildSource]
  );

  // Format time from timestamp
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Whether to show the +/- controls (hide for coffee "other" since amount comes from the custom ml field)
  const showAmountControls = !(liquidType === "coffee" && selectedCoffeeType === "other");

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          `bg-gradient-to-br ${theme.gradient} ${theme.border}`
        )}
      >
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", theme.iconBg)}>
                <Icon className={cn("w-5 h-5", theme.iconColor)} />
              </div>
              <span className="font-semibold text-lg uppercase tracking-wide">
                {theme.label}
              </span>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "text-sm font-medium",
                  isOverLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
                )}
              >
                {formatAmount(dailyTotal, unit)} / {formatAmount(limit, unit)}
              </p>
              <p className="text-xs text-muted-foreground">today</p>
              <p className="text-xs text-muted-foreground/70">
                24h: {formatAmount(rollingTotal, unit)}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <Progress
              value={progressPercent}
              className="h-3"
              indicatorClassName={cn(
                isOverLimit ? "bg-red-500" : theme.progressGradient
              )}
            />
          </div>

          {/* Liquid Type Selector (water card only) */}
          {type === "water" && (
            <div className="flex gap-1 mb-4 p-1 rounded-lg bg-muted/50" role="group" aria-label="Liquid type">
              {LIQUID_TYPE_OPTIONS.map((opt) => {
                const needsSource = opt.value !== "water";
                const disabled = needsSource && !onConfirmWithSource;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={liquidType === opt.value}
                    onClick={() => setLiquidType(opt.value)}
                    disabled={disabled}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                      liquidType === opt.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      disabled && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Inline fields for Coffee */}
          {type === "water" && liquidType === "coffee" && (
            <div className="mb-4 space-y-3">
              <Label className="text-xs text-muted-foreground">Coffee type</Label>
              <div className="grid grid-cols-2 gap-2">
                {COFFEE_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "transition-all",
                      selectedCoffeeType === preset.value &&
                        "bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700"
                    )}
                    onClick={() => handleCoffeeTypeSelect(preset.value)}
                  >
                    {preset.label}
                    {preset.waterMl > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({preset.waterMl}ml)
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              {selectedCoffeeType === "other" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="coffee-other-name" className="text-xs">Name</Label>
                    <Input
                      id="coffee-other-name"
                      placeholder="e.g. Latte, Cappuccino"
                      value={coffeeOtherName}
                      onChange={(e) => setCoffeeOtherName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="coffee-other-ml" className="text-xs">Water content (ml)</Label>
                    <Input
                      id="coffee-other-ml"
                      type="number"
                      min="1"
                      max="1000"
                      value={coffeeOtherMl}
                      onChange={(e) => setCoffeeOtherMl(e.target.value)}
                      className="h-8 text-sm text-center"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inline fields for Juice */}
          {type === "water" && liquidType === "juice" && (
            <div className="mb-4">
              <Label htmlFor="juice-name" className="text-xs text-muted-foreground">Juice type (optional)</Label>
              <Input
                id="juice-name"
                placeholder="e.g. Orange juice"
                value={juiceName}
                onChange={(e) => setJuiceName(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          )}

          {/* Inline fields for Food */}
          {type === "water" && liquidType === "food" && (
            <div className="mb-4">
              <Label htmlFor="food-note" className="text-xs text-muted-foreground">Food note (optional)</Label>
              <Input
                id="food-note"
                placeholder="e.g. Soup, watermelon"
                value={foodNote}
                onChange={(e) => setFoodNote(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          )}

          {/* Input Controls */}
          {showAmountControls ? (
            <div className="flex items-center justify-between gap-3">
              {/* Decrement Button */}
              <Button
                variant="outline"
                size="icon-lg"
                onClick={handleDecrement}
                disabled={pendingAmount <= increment || isSubmitting}
                className={cn("shrink-0 rounded-full transition-all", theme.hoverBg)}
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
                  "hover:scale-105 active:scale-95",
                  theme.inputBg
                )}
              >
                <span
                  className={cn(
                    "text-3xl font-bold tabular-nums",
                    wouldExceedLimit && !isOverLimit
                      ? "text-orange-600 dark:text-orange-400"
                      : theme.inputText
                  )}
                >
                  +{formatAmount(pendingAmount, unit)}
                </span>
                <span className="text-xs text-muted-foreground">
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
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>
          ) : (
            /* Coffee "Other" - amount comes from the ml input, show a summary */
            <div className="flex items-center justify-center py-3 px-4 rounded-xl bg-sky-50 dark:bg-sky-950/30">
              <span className="text-sm text-muted-foreground">Water content: </span>
              <span className="font-semibold text-sky-700 dark:text-sky-300 ml-1">
                {effectiveAmount()} ml
              </span>
            </div>
          )}

          {/* Confirm Button */}
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading || effectiveAmount() <= 0}
            className={cn("w-full mt-4 h-12 text-base font-semibold", theme.buttonBg)}
          >
            <Check className="w-5 h-5 mr-2" />
            {isSubmitting ? "Recording..." : "Confirm Entry"}
          </Button>

          {/* Recent Entries */}
          <RecentEntriesList
            records={recentRecords}
            deletingId={deletingId}
            onDelete={handleDelete}
            onEdit={openEdit}
            borderColor={theme.border}
            renderEntry={(record) => {
              const sourceLabel = type === "water" ? getLiquidTypeLabel(record.source) : null;
              return (
                <>
                  <span className="text-muted-foreground">{formatTime(record.timestamp)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatAmount(record.amount, unit)}
                    </span>
                    {sourceLabel && (
                      <span className="text-xs text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded">
                        {sourceLabel}
                      </span>
                    )}
                  </div>
                </>
              );
            }}
          />
        </CardContent>
      </Card>

      <ManualInputDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        type={type}
        currentValue={pendingAmount}
        onSubmit={handleManualSubmit}
        isSubmitting={isSubmitting}
      />

      <EditIntakeDialog
        record={editingRecord}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        amount={editAmount}
        onAmountChange={setEditAmount}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        note={editNote}
        onNoteChange={setEditNote}
      />
    </>
  );
}
