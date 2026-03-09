"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { useToast } from "@/hooks/use-toast";
import { useSubstanceRecordsByDateRange } from "@/hooks/use-substance-queries";
import { useAddSubstance } from "@/hooks/use-substance-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { formatDateTime } from "@/lib/date-utils";
import {
  SubstanceTypePicker,
  type SubstanceTypeSelection,
} from "@/components/substance/substance-type-picker";
import { getDayStartTimestamp } from "@/hooks/use-intake-queries";

interface SubstanceRowProps {
  type: "caffeine" | "alcohol";
}

export function SubstanceRow({ type }: SubstanceRowProps) {
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const addSubstance = useAddSubstance();
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);

  const theme = type === "caffeine" ? CARD_THEMES.caffeine : CARD_THEMES.alcohol;
  const Icon = theme.icon;

  // Get today's records using day start boundary
  const dayStart = useMemo(() => getDayStartTimestamp(dayStartHour), [dayStartHour]);
  const dayEnd = useMemo(() => dayStart + 24 * 60 * 60 * 1000, [dayStart]);
  const todayRecords = useSubstanceRecordsByDateRange(dayStart, dayEnd, type);

  // Calculate today's totals
  const todayTotal = useMemo(() => {
    if (!todayRecords || todayRecords.length === 0) return 0;
    if (type === "caffeine") {
      return todayRecords.reduce((sum, r) => sum + (r.amountMg ?? 0), 0);
    }
    return todayRecords.reduce((sum, r) => sum + (r.amountStandardDrinks ?? 0), 0);
  }, [todayRecords, type]);

  // Last 3 entries
  const recentEntries = useMemo(() => {
    if (!todayRecords) return [];
    return [...todayRecords]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3);
  }, [todayRecords]);

  const handleSelect = async (selection: SubstanceTypeSelection) => {
    setIsAdding(true);
    try {
      await addSubstance({
        type,
        ...(selection.amountMg !== undefined && { amountMg: selection.amountMg }),
        ...(selection.amountStandardDrinks !== undefined && { amountStandardDrinks: selection.amountStandardDrinks }),
        ...(selection.volumeMl > 0 && { volumeMl: selection.volumeMl }),
        description: selection.description,
        source: "standalone",
      });
      toast({
        title: "Logged",
        description: `${selection.description} recorded`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const totalDisplay =
    type === "caffeine"
      ? `${Math.round(todayTotal)} mg`
      : `${todayTotal.toFixed(1)} drinks`;

  return (
    <>
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300 bg-gradient-to-br",
          theme.gradient,
          theme.border
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", theme.iconBg)}>
                <Icon className={cn("w-5 h-5", theme.iconColor)} />
              </div>
              <span className="font-semibold text-lg uppercase tracking-wide">
                {theme.label}
              </span>
            </div>
            <div className={cn("text-2xl font-bold", theme.latestValueColor)}>
              {totalDisplay}
            </div>
          </div>

          <Button
            onClick={() => setPickerOpen(true)}
            disabled={isAdding}
            className={cn("w-full h-11", theme.buttonBg)}
          >
            {isAdding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <PlusCircle className="w-4 h-4 mr-2" />
                Add {type === "caffeine" ? "Caffeine" : "Alcohol"}
              </>
            )}
          </Button>

          {/* Recent entries */}
          {recentEntries.length > 0 && (
            <div className="mt-3 space-y-1">
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>{formatDateTime(entry.timestamp)}</span>
                  <span className="truncate ml-2 max-w-[40%] text-right">
                    {entry.description}
                  </span>
                  <span className="font-medium ml-2 shrink-0">
                    {type === "caffeine"
                      ? `${entry.amountMg ?? 0}mg`
                      : `${entry.amountStandardDrinks ?? 0} dr`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SubstanceTypePicker
        type={type}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelect}
      />
    </>
  );
}
