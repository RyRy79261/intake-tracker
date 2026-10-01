"use client";

import { useState } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Check } from "lucide-react";
import { SubToggle, optOnClass as SEG_ON, unitClass } from "@/components/domain-scope";
import { Spinner } from "@intake/ui/spinner";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { ModuleCard } from "@/components/home/module-card";
import { CARD_THEMES } from "@/lib/card-themes";
import { logAudit } from "@/lib/audit";

function pulsePressureColor(pp: number) {
  // Normal pulse pressure is roughly 40 mmHg; >60 elevated, <30 narrow.
  return pp > 60 || pp < 30 ? "text-bp" : "text-muted-foreground";
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
} from "@/lib/date-utils";
import { getBPCategory } from "@/lib/constants";
import { useFieldId, useOnLogged } from "@/components/log-form-scope";

// Format BP reading
function formatBPReading(record: BloodPressureRecord): string {
  return `${record.systolic}/${record.diastolic}`;
}

const theme = CARD_THEMES.bp;
const Icon = theme.icon;

export function BloodPressureCard() {
  const onLogged = useOnLogged();
  const fid = useFieldId();
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
      onLogged();
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
    <ModuleCard
      domain={theme.domain}
      icon={Icon}
      title={theme.label}
      data-testid="bp-card"
      right={
        isLoading ? (
          <span className="inline-block h-8 w-24 animate-pulse bg-foreground/10" />
        ) : latestReading ? (
          <>
            <b>{formatBPReading(latestReading)}</b> mmHg
            <br />
            {bpCategory && (
              <span className={cn("font-sans text-xs", bpCategory.color)} data-testid="bp-category">
                {bpCategory.label}
              </span>
            )}
            {latestReading.heartRate ? ` · ${latestReading.heartRate} BPM` : ""}
            {pulsePressure !== null && (
              <>
                {" · PP "}
                <span className={pulsePressureColor(pulsePressure)} aria-label={`Pulse pressure ${pulsePressure} mmHg`}>
                  {pulsePressure}
                </span>
              </>
            )}
          </>
        ) : null
      }
    >
        <div className="space-y-3">
          {/* Primary inputs: Systolic / Diastolic (always visible) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={fid("systolic")} className="text-[0.8125rem] text-muted-foreground">Systolic (top)</Label>
              <Input
                id={fid("systolic")}
                type="number"
                min={BP_RANGES.systolic.min}
                max={BP_RANGES.systolic.max}
                placeholder="120"
                value={systolicInput}
                onChange={(e) => setSystolicInput(e.target.value)}
                className="h-12 text-lg font-semibold text-center num"
              />
              {fieldErrors.systolic && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.systolic}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={fid("diastolic")} className="text-[0.8125rem] text-muted-foreground">Diastolic (bottom)</Label>
              <Input
                id={fid("diastolic")}
                type="number"
                min={BP_RANGES.diastolic.min}
                max={BP_RANGES.diastolic.max}
                placeholder="80"
                value={diastolicInput}
                onChange={(e) => setDiastolicInput(e.target.value)}
                className="h-12 text-lg font-semibold text-center num"
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
            <Label htmlFor={fid("heartrate")} className="text-[0.8125rem] text-muted-foreground">Heart Rate (optional)</Label>
            <div className="flex gap-2">
              <Input
                id={fid("heartrate")}
                type="number"
                min={BP_RANGES.heartRate.min}
                max={BP_RANGES.heartRate.max}
                placeholder="72"
                value={heartRateInput}
                onChange={(e) => setHeartRateInput(e.target.value)}
                className="text-center num"
              />
              <div className={cn("flex items-center border border-line px-3 text-sm", unitClass)}>
                BPM
              </div>
            </div>
            {fieldErrors.heartRate && (
              <p className="text-sm text-destructive mt-1">{fieldErrors.heartRate}</p>
            )}
          </div>

          {/* Expandable details section */}
          <SubToggle expanded={showDetails} onToggle={() => setShowDetails(!showDetails)}>
            More options
          </SubToggle>

          {showDetails && (
            <div className="space-y-3">
              {/* Position Toggle */}
              <div className="space-y-2">
                <Label className="text-[0.8125rem] text-muted-foreground">Position</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={position === "sitting"}
                    className={cn("flex-1", position === "sitting" && SEG_ON)}
                    onClick={() => setPosition("sitting")}
                  >
                    Sitting
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={position === "standing"}
                    className={cn("flex-1", position === "standing" && SEG_ON)}
                    onClick={() => setPosition("standing")}
                  >
                    Standing
                  </Button>
                </div>
              </div>

              {/* Arm Toggle */}
              <div className="space-y-2">
                <Label className="text-[0.8125rem] text-muted-foreground">Arm</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={arm === "left"}
                    className={cn("flex-1", arm === "left" && SEG_ON)}
                    onClick={() => setArm("left")}
                  >
                    Left
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={arm === "right"}
                    className={cn("flex-1", arm === "right" && SEG_ON)}
                    onClick={() => setArm("right")}
                  >
                    Right
                  </Button>
                </div>
              </div>

              {/* Irregular Heartbeat */}
              <div className="space-y-2">
                <Label className="text-[0.8125rem] text-muted-foreground">Irregular Heartbeat</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={!irregularHeartbeat}
                    className={cn("flex-1", !irregularHeartbeat && SEG_ON)}
                    onClick={() => setIrregularHeartbeat(false)}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={irregularHeartbeat}
                    className={cn("flex-1", irregularHeartbeat && SEG_ON)}
                    onClick={() => setIrregularHeartbeat(true)}
                  >
                    Yes
                  </Button>
                </div>
              </div>

              {/* Note */}
              <div className="space-y-2">
                <Label htmlFor={fid("bp-note")} className="text-[0.8125rem] text-muted-foreground">Note (optional)</Label>
                <Input
                  id={fid("bp-note")}
                  aria-label="Blood pressure note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Time Override */}
              <CollapsibleTimeInputControlled
                value={customTime}
                onChange={setCustomTime}
                expanded={showTimeInput}
                onToggle={() => setShowTimeInput(!showTimeInput)}
                id={fid("bp-time")}
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
            className="w-full"
          >
            {addMutation.isPending ? (
              <>
                <Spinner className="size-4 mr-2" />
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
          renderLabel={(record) =>
            [
              record.position,
              `${record.arm} arm`,
              record.heartRate ? `${record.heartRate} bpm` : null,
              record.irregularHeartbeat ? "irregular" : null,
            ]
              .filter(Boolean)
              .join(" · ")
          }
          renderValue={(record) => {
            const category = getBPCategory(record.systolic, record.diastolic);
            return (
              <span className={category.color} title={category.label}>
                {formatBPReading(record)}
              </span>
            );
          }}
          renderEditForm={() => (
            <InlineEditFormShell timestamp={editTimestamp} onTimestampChange={setEditTimestamp} note={editNote} onNoteChange={setEditNote} onSave={() => handleEditSubmit()} onCancel={closeEdit}>
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
                <Checkbox id={fid("edit-irregular-heartbeat")} checked={editIrregularHeartbeat} onCheckedChange={(checked) => setEditIrregularHeartbeat(checked === true)} />
                <Label htmlFor={fid("edit-irregular-heartbeat")} className="text-sm cursor-pointer">Irregular heartbeat</Label>
              </div>
            </InlineEditFormShell>
          )}
        />
    </ModuleCard>
  );
}
