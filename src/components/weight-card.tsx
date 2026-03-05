"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@/hooks/use-toast";
import { type WeightRecord } from "@/lib/db";
import { useWeightRecords, useAddWeight, useDeleteWeight, useUpdateWeight } from "@/hooks/use-health-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

const theme = CARD_THEMES.weight;
const Icon = theme.icon;

export function WeightCard() {
  const { toast } = useToast();
  const [weightInput, setWeightInput] = useState("");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const { data: recentRecords, isLoading, error } = useWeightRecords(5);
  const addMutation = useAddWeight();
  const deleteMutation = useDeleteWeight();
  const updateMutation = useUpdateWeight();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Weight record removed");

  // Extra edit field
  const [editWeight, setEditWeight] = useState("");

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<WeightRecord>({
    onOpen: (record) => setEditWeight(record.weight.toString()),
    buildUpdates: (timestamp, note) => {
      const newWeight = parseFloat(editWeight);
      if (isNaN(newWeight) || newWeight <= 0) {
        toast({ title: "Invalid weight", variant: "destructive" });
        return null;
      }
      return { weight: newWeight, timestamp, note };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

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
      await addMutation.mutateAsync({ weight, ...(timestamp !== undefined && { timestamp }) });
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

  return (
    <>
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
              <div className={cn("h-6 w-16 rounded ml-auto", theme.loadingBg)} />
              <div className="h-4 w-24 bg-muted rounded mt-1 ml-auto" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>Failed to load</span>
            </div>
          ) : latestWeight ? (
            <div className="text-right">
              <p className={cn("text-lg font-bold", theme.latestValueColor)}>
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

          <CollapsibleTimeInputControlled
            value={customTime}
            onChange={setCustomTime}
            expanded={showTimeInput}
            onToggle={() => setShowTimeInput(!showTimeInput)}
            id="weight-time"
          />

          <Button
            onClick={handleSubmit}
            disabled={addMutation.isPending || !weightInput}
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
                Record Weight
              </>
            )}
          </Button>
        </div>

        {/* Recent History */}
        <RecentEntriesList
          records={recentRecords}
          deletingId={deletingId}
          onDelete={handleDelete}
          onEdit={openEdit}
          borderColor={theme.border}
          renderEntry={(record) => (
            <>
              <span className="text-muted-foreground">{formatDateTime(record.timestamp)}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{record.weight} kg</span>
              </div>
            </>
          )}
        />
      </CardContent>
    </Card>

    <EditWeightDialog
      record={editingRecord}
      onClose={closeEdit}
      onSubmit={handleEditSubmit}
      weight={editWeight}
      onWeightChange={setEditWeight}
      timestamp={editTimestamp}
      onTimestampChange={setEditTimestamp}
      note={editNote}
      onNoteChange={setEditNote}
    />
    </>
  );
}
