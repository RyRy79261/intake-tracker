"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { logAudit } from "@/lib/audit";

const BloodPressureFormSchema = z.object({
  systolic: z.number({ invalid_type_error: "Systolic is required" })
    .int("Must be a whole number").min(50, "Too low").max(300, "Too high"),
  diastolic: z.number({ invalid_type_error: "Diastolic is required" })
    .int("Must be a whole number").min(20, "Too low").max(200, "Too high"),
  heartRate: z.number().int("Must be a whole number").min(20, "Too low").max(250, "Too high").optional(),
});
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@/hooks/use-toast";
import { type BloodPressureRecord } from "@/lib/db";
import { useBloodPressureRecords, useAddBloodPressure, useDeleteBloodPressure, useUpdateBloodPressure } from "@/hooks/use-health-queries";
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
  const [irregularHeartbeat, setIrregularHeartbeat] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const recentRecords = useBloodPressureRecords(5);
  const isLoading = !recentRecords;
  const addMutation = useAddBloodPressure();
  const deleteMutation = useDeleteBloodPressure();
  const updateMutation = useUpdateBloodPressure();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Blood pressure record removed");

  // Extra edit fields (BP-specific)
  const [editSystolic, setEditSystolic] = useState("");
  const [editDiastolic, setEditDiastolic] = useState("");
  const [editHeartRate, setEditHeartRate] = useState("");
  const [editPosition, setEditPosition] = useState<"sitting" | "standing">("sitting");
  const [editArm, setEditArm] = useState<"left" | "right">("left");
  const [editIrregularHeartbeat, setEditIrregularHeartbeat] = useState(false);

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<BloodPressureRecord>({
    onOpen: (record) => {
      setEditSystolic(record.systolic.toString());
      setEditDiastolic(record.diastolic.toString());
      setEditHeartRate(record.heartRate?.toString() || "");
      setEditPosition(record.position);
      setEditArm(record.arm);
      setEditIrregularHeartbeat(record.irregularHeartbeat || false);
    },
    buildUpdates: (timestamp, note) => {
      const newSystolic = parseInt(editSystolic, 10);
      const newDiastolic = parseInt(editDiastolic, 10);
      if (isNaN(newSystolic) || isNaN(newDiastolic) || newSystolic <= 0 || newDiastolic <= 0) {
        toast({ title: "Invalid values", variant: "destructive" });
        return null;
      }
      let newHeartRate: number | undefined;
      if (editHeartRate) {
        newHeartRate = parseInt(editHeartRate, 10);
        if (isNaN(newHeartRate) || newHeartRate <= 0) {
          toast({ title: "Invalid values", variant: "destructive" });
          return null;
        }
      }
      return {
        systolic: newSystolic,
        diastolic: newDiastolic,
        ...(newHeartRate !== undefined && { heartRate: newHeartRate }),
        ...(editIrregularHeartbeat && { irregularHeartbeat: true as const }),
        position: editPosition,
        arm: editArm,
        ...(timestamp !== undefined && { timestamp }),
        ...(note !== undefined && { note }),
      };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const latestReading = recentRecords?.[0];
  const bpCategory = latestReading
    ? getBPCategory(latestReading.systolic, latestReading.diastolic)
    : null;

  const handleSubmit = async () => {
    const systolic = parseInt(systolicInput, 10);
    const diastolic = parseInt(diastolicInput, 10);
    const heartRate = heartRateInput ? parseInt(heartRateInput, 10) : undefined;

    const parsed = BloodPressureFormSchema.safeParse({
      systolic: isNaN(systolic) ? undefined : systolic,
      diastolic: isNaN(diastolic) ? undefined : diastolic,
      ...(heartRate !== undefined && !isNaN(heartRate) && { heartRate }),
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") errors[field] = issue.message;
      }
      setFieldErrors(errors);
      logAudit("validation_error", JSON.stringify({ form: "blood_pressure", errors: parsed.error.flatten() }).slice(0, 100));
      return;
    }
    setFieldErrors({});

    try {
      const timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
      await addMutation.mutateAsync({
        systolic, diastolic, position, arm,
        ...(heartRate !== undefined && { heartRate }),
        ...(irregularHeartbeat && { irregularHeartbeat: true as const }),
        ...(timestamp !== undefined && { timestamp }),
      });
      toast({
        title: "Blood pressure recorded",
        description: `${systolic}/${diastolic} mmHg logged successfully`,
        variant: "success",
      });
      setSystolicInput("");
      setDiastolicInput("");
      setHeartRateInput("");
      setIrregularHeartbeat(false);
      setShowDetails(false);
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
              <div className={cn("h-6 w-20 rounded ml-auto", theme.loadingBg)} />
              <div className="h-4 w-16 bg-muted rounded mt-1 ml-auto" />
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
              {latestReading.heartRate && (
                <p className="text-xs text-muted-foreground">{latestReading.heartRate} BPM</p>
              )}
              {(() => {
                const prev = recentRecords?.[1];
                if (!prev) return null;
                const sysDelta = latestReading.systolic - prev.systolic;
                const diaDelta = latestReading.diastolic - prev.diastolic;
                const fmt = (d: number) => (d > 0 ? `+${d}` : `${d}`);
                const clr = (d: number) =>
                  d > 0
                    ? "text-red-500 dark:text-red-400"
                    : d < 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground";
                return (
                  <p className="text-xs">
                    <span className={clr(sysDelta)}>{fmt(sysDelta)}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className={clr(diaDelta)}>{fmt(diaDelta)}</span>
                  </p>
                );
              })()}
            </div>
          ) : null}
        </div>

        {/* Input Section */}
        <div className="space-y-3">
          {/* Primary inputs: Systolic / Diastolic (always visible) */}
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
              {fieldErrors.systolic && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.systolic}</p>
              )}
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
              {fieldErrors.diastolic && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.diastolic}</p>
              )}
            </div>
          </div>

          {/* Heart Rate (optional) - promoted to primary input area */}
          <div className="space-y-1 mt-2">
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
                className="h-11 text-center bg-white/80 dark:bg-slate-900/50"
              />
              <div className="flex items-center px-3 text-sm font-medium text-muted-foreground bg-muted rounded-md">
                BPM
              </div>
            </div>
            {fieldErrors.heartRate && (
              <p className="text-sm text-destructive mt-1">{fieldErrors.heartRate}</p>
            )}
          </div>

          {/* Expandable details section */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground hover:text-foreground"
            onClick={() => setShowDetails(!showDetails)}
          >
            <span>More options</span>
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>

          {showDetails && (
            <div className="p-3 rounded-lg bg-muted/50 border space-y-3">
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

              {/* Irregular Heartbeat */}
              <div className="space-y-2">
                <Label className="text-xs">Irregular Heartbeat</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex-1 transition-all",
                      !irregularHeartbeat && theme.activeToggle
                    )}
                    onClick={() => setIrregularHeartbeat(false)}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex-1 transition-all",
                      irregularHeartbeat && "bg-red-100 border-red-300 dark:bg-red-900/50 dark:border-red-700"
                    )}
                    onClick={() => setIrregularHeartbeat(true)}
                  >
                    Yes
                  </Button>
                </div>
              </div>

              {/* Time Override */}
              <CollapsibleTimeInputControlled
                value={customTime}
                onChange={setCustomTime}
                expanded={showTimeInput}
                onToggle={() => setShowTimeInput(!showTimeInput)}
                id="bp-time"
              />
            </div>
          )}

          {/* Record button */}
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
          onEdit={openEdit}
          editingId={editingRecord?.id ?? null}
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
                    {record.irregularHeartbeat && " · irregular"}
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
          renderEditForm={() => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Systolic" value={editSystolic} onChange={(e) => setEditSystolic(e.target.value)} className="h-8 text-sm" />
                <Input type="number" placeholder="Diastolic" value={editDiastolic} onChange={(e) => setEditDiastolic(e.target.value)} className="h-8 text-sm" />
              </div>
              <Input type="number" placeholder="Heart rate (optional)" value={editHeartRate} onChange={(e) => setEditHeartRate(e.target.value)} className="h-8 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={editPosition} onChange={(e) => setEditPosition(e.target.value as "sitting" | "standing")} className="h-8 text-sm rounded-md border bg-background px-2">
                  <option value="sitting">Sitting</option>
                  <option value="standing">Standing</option>
                </select>
                <select value={editArm} onChange={(e) => setEditArm(e.target.value as "left" | "right")} className="h-8 text-sm rounded-md border bg-background px-2">
                  <option value="left">Left arm</option>
                  <option value="right">Right arm</option>
                </select>
              </div>
              <Input type="datetime-local" value={editTimestamp} onChange={(e) => setEditTimestamp(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Note (optional)" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="h-8 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" className={cn("flex-1 h-8", theme.buttonBg)} onClick={handleEditSubmit}>Save</Button>
                <Button size="sm" variant="outline" className="flex-1 h-8" onClick={closeEdit}>Cancel</Button>
              </div>
            </div>
          )}
        />
      </CardContent>
    </Card>
    </>
  );
}
