"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, Check, Clock, ChevronDown, ChevronUp, Loader2, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWeightRecords, useAddWeight, useDeleteWeight } from "@/hooks/use-health-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

export function WeightCard() {
  const { toast } = useToast();
  const [weightInput, setWeightInput] = useState("");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Get recent weight records via TanStack Query
  const { data: recentRecords, isLoading, error } = useWeightRecords(5);
  const addMutation = useAddWeight();
  const deleteMutation = useDeleteWeight();

  const latestWeight = recentRecords?.[0];

  const handleSubmit = async () => {
    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight <= 0) {
      toast({
        title: "Invalid weight",
        description: "Please enter a valid weight",
        variant: "destructive",
      });
      return;
    }

    try {
      const timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
      await addMutation.mutateAsync({ weight, timestamp });
      toast({
        title: "Weight recorded",
        description: `${weight} kg logged successfully`,
        variant: "success",
      });
      setWeightInput("");
      setShowTimeInput(false);
      setCustomTime(getCurrentDateTimeLocal());
    } catch (error) {
      console.error("Failed to record weight:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record weight",
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
        description: "Weight record removed",
      });
    } catch (error) {
      console.error("Failed to delete weight record:", error);
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
    <Card className="relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border-emerald-200 dark:border-emerald-800">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Scale className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">Weight</span>
          </div>
          {isLoading ? (
            <div className="animate-pulse text-right">
              <div className="h-6 w-16 bg-emerald-200 dark:bg-emerald-800 rounded ml-auto" />
              <div className="h-4 w-24 bg-muted rounded mt-1 ml-auto" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>Failed to load</span>
            </div>
          ) : latestWeight ? (
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {latestWeight.weight} kg
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(latestWeight.timestamp)}
              </p>
            </div>
          ) : null}
        </div>

        {/* Input Section */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder="Enter weight"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="h-12 text-lg text-center bg-white/80 dark:bg-slate-900/50"
              />
            </div>
            <div className="flex items-center px-3 text-sm font-medium text-muted-foreground bg-muted rounded-md">
              kg
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
              <Label htmlFor="weight-time" className="text-sm">
                When was this measured?
              </Label>
              <Input
                id="weight-time"
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
            disabled={addMutation.isPending || !weightInput}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Record Weight
              </>
            )}
          </Button>
        </div>

        {/* Recent History */}
        {recentRecords && recentRecords.length > 0 && (
          <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
            <div className="space-y-1">
              {recentRecords.slice(0, 3).map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <span className="text-muted-foreground">{formatDateTime(record.timestamp)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{record.weight} kg</span>
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
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
