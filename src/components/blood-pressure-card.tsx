"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Check, Clock, ChevronDown, ChevronUp, Loader2, Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { type BloodPressureRecord } from "@/lib/db";
import { useBloodPressureRecords, useAddBloodPressure, useDeleteBloodPressure } from "@/hooks/use-health-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

// Format BP reading
function formatBPReading(record: BloodPressureRecord): string {
  return `${record.systolic}/${record.diastolic}`;
}

// Get BP category color
function getBPCategory(systolic: number, diastolic: number): { label: string; color: string } {
  if (systolic < 120 && diastolic < 80) {
    return { label: "Normal", color: "text-green-600 dark:text-green-400" };
  } else if (systolic < 130 && diastolic < 80) {
    return { label: "Elevated", color: "text-yellow-600 dark:text-yellow-400" };
  } else if (systolic < 140 || diastolic < 90) {
    return { label: "High Stage 1", color: "text-orange-600 dark:text-orange-400" };
  } else {
    return { label: "High Stage 2", color: "text-red-600 dark:text-red-400" };
  }
}

export function BloodPressureCard() {
  const { toast } = useToast();
  const [systolicInput, setSystolicInput] = useState("");
  const [diastolicInput, setDiastolicInput] = useState("");
  const [heartRateInput, setHeartRateInput] = useState("");
  const [position, setPosition] = useState<"sitting" | "standing">("sitting");
  const [arm, setArm] = useState<"left" | "right">("left");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Get recent BP records via TanStack Query
  const { data: recentRecords, isLoading, error } = useBloodPressureRecords(5);
  const addMutation = useAddBloodPressure();
  const deleteMutation = useDeleteBloodPressure();

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

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast({
        title: "Entry deleted",
        description: "Blood pressure record removed",
      });
    } catch (error) {
      console.error("Failed to delete blood pressure record:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not delete entry",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40 border-rose-200 dark:border-rose-800">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/50">
              <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">Blood Pressure</span>
          </div>
          {isLoading ? (
            <div className="animate-pulse text-right">
              <div className="h-6 w-20 bg-rose-200 dark:bg-rose-800 rounded ml-auto" />
              <div className="h-4 w-16 bg-muted rounded mt-1 ml-auto" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>Failed to load</span>
            </div>
          ) : latestReading ? (
            <div className="text-right">
              <p className="text-lg font-bold text-rose-700 dark:text-rose-300">
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
                  position === "sitting" && "bg-rose-100 border-rose-300 dark:bg-rose-900/50 dark:border-rose-700"
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
                  position === "standing" && "bg-rose-100 border-rose-300 dark:bg-rose-900/50 dark:border-rose-700"
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
                  arm === "left" && "bg-rose-100 border-rose-300 dark:bg-rose-900/50 dark:border-rose-700"
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
                  arm === "right" && "bg-rose-100 border-rose-300 dark:bg-rose-900/50 dark:border-rose-700"
                )}
                onClick={() => setArm("right")}
              >
                Right
              </Button>
            </div>
          </div>

          {/* Custom time section */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground hover:text-foreground"
            onClick={() => setShowTimeInput(!showTimeInput)}
          >
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {showTimeInput ? "Using custom time" : "Set different time"}
            </span>
            {showTimeInput ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>

          {showTimeInput && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <Label htmlFor="bp-time" className="text-sm">
                When was this measured?
              </Label>
              <Input
                id="bp-time"
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                max={getCurrentDateTimeLocal()}
                className="mt-2 text-sm"
              />
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending || !systolicInput || !diastolicInput}
            className="w-full h-11 bg-rose-600 hover:bg-rose-700"
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
        {recentRecords && recentRecords.length > 0 && (
          <div className="mt-4 pt-4 border-t border-rose-200 dark:border-rose-800">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
            <div className="space-y-2">
              {recentRecords.slice(0, 3).map((record) => {
                const category = getBPCategory(record.systolic, record.diastolic);
                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex flex-col">
                      <span className="text-muted-foreground text-xs">{formatDateTime(record.timestamp)}</span>
                      <span className="text-xs text-muted-foreground/70">
                        {record.position} • {record.arm} arm
                        {record.heartRate && ` • ${record.heartRate} BPM`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="font-medium">{formatBPReading(record)}</span>
                        <span className={cn("text-xs ml-1", category.color)}>
                          ({category.label})
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-red-600"
                        onClick={() => handleDelete(record.id)}
                        disabled={deletingId === record.id}
                      >
                        {deletingId === record.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
