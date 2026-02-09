"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useToast } from "@/hooks/use-toast";
import { type BloodPressureRecord } from "@/lib/db";
import { useBloodPressureRecords, useAddBloodPressure, useDeleteBloodPressure } from "@/hooks/use-health-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";
import { getBPCategory } from "@/lib/constants";

// Format BP reading
function formatBPReading(record: BloodPressureRecord): string {
  return `${record.systolic}/${record.diastolic}`;
}

const theme = CARD_THEMES.bp;
const Icon = theme.icon;

export function BloodPressureCard() {
  const { toast } = useToast();
  const [systolicInput, setSystolicInput] = useState("");
  const [diastolicInput, setDiastolicInput] = useState("");
  const [heartRateInput, setHeartRateInput] = useState("");
  const [position, setPosition] = useState<"sitting" | "standing">("sitting");
  const [arm, setArm] = useState<"left" | "right">("left");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const { data: recentRecords, isLoading, error } = useBloodPressureRecords(5);
  const addMutation = useAddBloodPressure();
  const deleteMutation = useDeleteBloodPressure();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Blood pressure record removed");

  const latestReading = recentRecords?.[0];
  const bpCategory = latestReading 
    ? getBPCategory(latestReading.systolic, latestReading.diastolic)
    : null;

  const handleSubmit = async () => {
    const systolic = parseInt(systolicInput, 10);
    const diastolic = parseInt(diastolicInput, 10);
    const heartRate = heartRateInput ? parseInt(heartRateInput, 10) : undefined;

    if (isNaN(systolic) || systolic <= 0 || isNaN(diastolic) || diastolic <= 0) {
      toast({
        title: "Invalid reading",
        description: "Please enter valid systolic and diastolic values",
        variant: "destructive",
      });
      return;
    }

    if (heartRate !== undefined && (isNaN(heartRate) || heartRate <= 0)) {
      toast({
        title: "Invalid heart rate",
        description: "Please enter a valid heart rate or leave it empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
      await addMutation.mutateAsync({ systolic, diastolic, position, arm, heartRate, timestamp });
      toast({
        title: "Blood pressure recorded",
        description: `${systolic}/${diastolic} mmHg logged successfully`,
        variant: "success",
      });
      setSystolicInput("");
      setDiastolicInput("");
      setHeartRateInput("");
      setShowTimeInput(false);
      setCustomTime(getCurrentDateTimeLocal());
    } catch (error) {
      console.error("Failed to record blood pressure:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record blood pressure",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className={cn("relative overflow-hidden transition-all duration-300 bg-gradient-to-br", theme.gradient, theme.border)}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", theme.iconBg)}>
              <Icon className={cn("w-5 h-5", theme.iconColor)} />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">{theme.label}</span>
          </div>
          {isLoading ? (
            <div className="animate-pulse text-right">
              <div className={cn("h-6 w-20 rounded ml-auto", theme.loadingBg)} />
              <div className="h-4 w-16 bg-muted rounded mt-1 ml-auto" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>Failed to load</span>
            </div>
          ) : latestReading ? (
            <div className="text-right">
              <p className={cn("text-lg font-bold", theme.latestValueColor)}>
                {formatBPReading(latestReading)} <span className="text-sm font-normal">mmHg</span>
              </p>
              {bpCategory && (
                <p className={cn("text-xs font-medium", bpCategory.color)}>
                  {bpCategory.label}
                </p>
              )}
            </div>
          ) : null}
        </div>

        {/* Input Section */}
        <div className="space-y-4">
          {/* Systolic / Diastolic */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="systolic" className="text-xs">Systolic (top)</Label>
              <Input
                id="systolic"
                type="number"
                min="0"
                max="300"
                placeholder="120"
                value={systolicInput}
                onChange={(e) => setSystolicInput(e.target.value)}
                className="h-12 text-lg text-center bg-white/80 dark:bg-slate-900/50"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="diastolic" className="text-xs">Diastolic (bottom)</Label>
              <Input
                id="diastolic"
                type="number"
                min="0"
                max="200"
                placeholder="80"
                value={diastolicInput}
                onChange={(e) => setDiastolicInput(e.target.value)}
                className="h-12 text-lg text-center bg-white/80 dark:bg-slate-900/50"
              />
            </div>
          </div>

          {/* Heart Rate (optional) */}
          <div className="space-y-1">
            <Label htmlFor="heartrate" className="text-xs">Heart Rate (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="heartrate"
                type="number"
                min="0"
                max="250"
                placeholder="72"
                value={heartRateInput}
                onChange={(e) => setHeartRateInput(e.target.value)}
                className="h-10 text-center bg-white/80 dark:bg-slate-900/50"
              />
              <div className="flex items-center px-3 text-sm font-medium text-muted-foreground bg-muted rounded-md">
                BPM
              </div>
            </div>
          </div>

          {/* Position Toggle */}
          <div className="space-y-2">
            <Label className="text-xs">Position</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 transition-all",
                  position === "sitting" && theme.activeToggle
                )}
                onClick={() => setPosition("sitting")}
              >
                Sitting
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 transition-all",
                  position === "standing" && theme.activeToggle
                )}
                onClick={() => setPosition("standing")}
              >
                Standing
              </Button>
            </div>
          </div>

          {/* Arm Toggle */}
          <div className="space-y-2">
            <Label className="text-xs">Arm</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 transition-all",
                  arm === "left" && theme.activeToggle
                )}
                onClick={() => setArm("left")}
              >
                Left
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 transition-all",
                  arm === "right" && theme.activeToggle
                )}
                onClick={() => setArm("right")}
              >
                Right
              </Button>
            </div>
          </div>

          <CollapsibleTimeInputControlled
            value={customTime}
            onChange={setCustomTime}
            expanded={showTimeInput}
            onToggle={() => setShowTimeInput(!showTimeInput)}
            id="bp-time"
          />

          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending || !systolicInput || !diastolicInput}
            className={cn("w-full h-11", theme.buttonBg)}
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Record Reading
              </>
            )}
          </Button>
        </div>

        {/* Recent History */}
        <RecentEntriesList
          records={recentRecords}
          deletingId={deletingId}
          onDelete={handleDelete}
          borderColor={theme.border}
          renderEntry={(record) => {
            const category = getBPCategory(record.systolic, record.diastolic);
            return (
              <>
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">{formatDateTime(record.timestamp)}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {record.position} · {record.arm} arm
                    {record.heartRate && ` · ${record.heartRate} BPM`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-medium">{formatBPReading(record)}</span>
                    <span className={cn("text-xs ml-1", category.color)}>
                      ({category.label})
                    </span>
                  </div>
                </div>
              </>
            );
          }}
        />
      </CardContent>
    </Card>
  );
}
