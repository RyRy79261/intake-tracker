"use client";

import { useState } from "react";
import { Card, CardContent } from "@intake/ui/card";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { domainStripeStyle } from "@/lib/domain-colors";
import { CARD_THEMES } from "@/lib/card-themes";
import { logAudit } from "@/lib/audit";

function pulsePressureColor(pp: number) {
  // Normal pulse pressure is roughly 40 mmHg; >60 elevated, <30 narrow.
  return pp > 60 || pp < 30
    ? "text-red-500 dark:text-red-400"
    : "text-muted-foreground";
}

import {
  BP_RANGES,
  bloodPressureRecordSchema,
  isSwappedBloodPressure,
  parseNumericInput,
} from "@intake/core/record-schemas";
import { validateBloodPressureEdit } from "@/components/edit-blood-pressure-dialog";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import { Checkbox } from "@intake/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@intake/ui/select";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@intake/ui/use-toast";
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
  const [note, setNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const recentRecords = useBloodPressureRecords(5);
  const isLoading = recentRecords === undefined;
  const addMutation = useAddBloodPressure();
  const deleteMutation = useDeleteBloodPressure();
  const updateMutation = useUpdateBloodPressure();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Blood pressure record removed", { undoToast: true });

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
      const values = validateBloodPressureEdit(
        { systolic: editSystolic, diastolic: editDiastolic, heartRate: editHeartRate },
        () => {
          setEditSystolic(editDiastolic);
          setEditDiastolic(editSystolic);
        },
      );
      if (!values) return null;
      // Optional fields are always sent: `null` / `false` clear them.
      return {
        systolic: values.systolic,
        diastolic: values.diastolic,
        heartRate: values.heartRate,
        irregularHeartbeat: editIrregularHeartbeat,
        position: editPosition,
        arm: editArm,
        timestamp,
        note: note ?? null,
      };
    },
    mutateAsync: updateMutation.mutateAsync,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [swapSuggested, setSwapSuggested] = useState(false);
  const latestReading = recentRecords?.[0];
  const bpCategory = latestReading
    ? getBPCategory(latestReading.systolic, latestReading.diastolic)
    : null;

  const handleSwap = () => {
    setSystolicInput(diastolicInput);
    setDiastolicInput(systolicInput);
    setFieldErrors({});
    setSwapSuggested(false);
  };

  const handleSubmit = async () => {
    // Number() (not parseInt) so "120.9" reaches .int() instead of being
    // silently truncated to 120.
    const systolic = parseNumericInput(systolicInput);
    const diastolic = parseNumericInput(diastolicInput);
    const heartRate = parseNumericInput(heartRateInput);
    let timestamp: number | undefined;
    try {
      timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
    } catch {
      setFieldErrors({ timestamp: "Invalid date/time" });
      return;
    }
    const trimmedNote = note.trim();

    const parsed = bloodPressureRecordSchema(Date.now()).safeParse({
      systolic,
      diastolic,
      ...(heartRate !== undefined && { heartRate }),
      ...(timestamp !== undefined && { timestamp }),
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string" && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      setSwapSuggested(
        systolic !== undefined && diastolic !== undefined && isSwappedBloodPressure(systolic, diastolic),
      );
      logAudit("validation_error", JSON.stringify({ form: "blood_pressure", errors: z.flattenError(parsed.error) }).slice(0, 100));
      return;
    }
    setFieldErrors({});
    setSwapSuggested(false);

    try {
      await addMutation.mutateAsync({
        systolic: parsed.data.systolic,
        diastolic: parsed.data.diastolic,
        position, arm,
        ...(parsed.data.heartRate != null && { heartRate: parsed.data.heartRate }),
        ...(irregularHeartbeat && { irregularHeartbeat: true as const }),
        ...(timestamp !== undefined && { timestamp }),
        ...(trimmedNote !== "" && { note: trimmedNote }),
        source: "manual",
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
      setNote("");
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

  const pulsePressure = latestReading
    ? latestReading.systolic - latestReading.diastolic
    : null;

  return (
    <>
    <Card className={cn("relative overflow-hidden transition-all duration-300 stripe", theme.gradient, theme.border)} style={domainStripeStyle(theme.domain)}>
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
              {pulsePressure !== null && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Pulse pressure </span>
                  <span className={pulsePressureColor(pulsePressure)}>{pulsePressure}</span>
                  <span className="text-muted-foreground"> mmHg</span>
                </p>
              )}
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
                min={BP_RANGES.systolic.min}
                max={BP_RANGES.systolic.max}
                placeholder="120"
                value={systolicInput}
                onChange={(e) => setSystolicInput(e.target.value)}
                className="h-12 text-lg text-center bg-background"
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
                min={BP_RANGES.diastolic.min}
                max={BP_RANGES.diastolic.max}
                placeholder="80"
                value={diastolicInput}
                onChange={(e) => setDiastolicInput(e.target.value)}
                className="h-12 text-lg text-center bg-background"
              />
              {fieldErrors.diastolic && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.diastolic}</p>
              )}
            </div>
          </div>
          {swapSuggested && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleSwap}>
              Swap values ({diastolicInput}/{systolicInput})
            </Button>
          )}

          {/* Heart Rate (optional) - promoted to primary input area */}
          <div className="space-y-1 mt-2">
            <Label htmlFor="heartrate" className="text-xs">Heart Rate (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="heartrate"
                type="number"
                min={BP_RANGES.heartRate.min}
                max={BP_RANGES.heartRate.max}
                placeholder="72"
                value={heartRateInput}
                onChange={(e) => setHeartRateInput(e.target.value)}
                className="h-11 text-center bg-background"
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

              {/* Note */}
              <div className="space-y-2">
                <Label htmlFor="bp-note" className="text-xs">Note (optional)</Label>
                <Input
                  id="bp-note"
                  aria-label="Blood pressure note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-9 text-sm bg-background"
                />
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
          {fieldErrors.timestamp && (
            <p className="text-sm text-destructive">{fieldErrors.timestamp}</p>
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
            <InlineEditFormShell timestamp={editTimestamp} onTimestampChange={setEditTimestamp} note={editNote} onNoteChange={setEditNote} onSave={() => handleEditSubmit()} onCancel={closeEdit} buttonClassName={theme.buttonBg}>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Systolic pressure" type="number" min={BP_RANGES.systolic.min} max={BP_RANGES.systolic.max} placeholder="Systolic" value={editSystolic} onChange={(e) => setEditSystolic(e.target.value)} className="h-8 text-sm" />
                <Input aria-label="Diastolic pressure" type="number" min={BP_RANGES.diastolic.min} max={BP_RANGES.diastolic.max} placeholder="Diastolic" value={editDiastolic} onChange={(e) => setEditDiastolic(e.target.value)} className="h-8 text-sm" />
              </div>
              <Input aria-label="Heart rate" type="number" min={BP_RANGES.heartRate.min} max={BP_RANGES.heartRate.max} placeholder="Heart rate (optional)" value={editHeartRate} onChange={(e) => setEditHeartRate(e.target.value)} className="h-8 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Select value={editPosition} onValueChange={(v) => setEditPosition(v as "sitting" | "standing")}>
                  <SelectTrigger aria-label="Position" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sitting">Sitting</SelectItem>
                    <SelectItem value="standing">Standing</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={editArm} onValueChange={(v) => setEditArm(v as "left" | "right")}>
                  <SelectTrigger aria-label="Arm" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left arm</SelectItem>
                    <SelectItem value="right">Right arm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="edit-irregular-heartbeat" checked={editIrregularHeartbeat} onCheckedChange={(checked) => setEditIrregularHeartbeat(checked === true)} />
                <Label htmlFor="edit-irregular-heartbeat" className="text-sm cursor-pointer">Irregular heartbeat</Label>
              </div>
            </InlineEditFormShell>
          )}
        />
      </CardContent>
    </Card>
    </>
  );
}
