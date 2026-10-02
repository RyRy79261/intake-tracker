"use client";

import { useState } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { SubToggle } from "@/components/domain-scope";
import { Spinner } from "@intake/ui/spinner";
import { CARD_THEMES } from "@/lib/card-themes";
import { ModuleCard, WhenLabel, useLogicalTodayRange } from "@/components/home/module-card";
import { RecentEntriesList, InlineEditFormShell } from "@/components/recent-entries-list";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@intake/ui/use-toast";
import { type UrinationRecord } from "@/lib/db";
import { useUrinationRecords, useUrinationRecordsByDateRange, useAddUrination, useDeleteUrination, useUpdateUrination } from "@/hooks/use-urination-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";
import { URINATION_AMOUNT_OPTIONS } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";
import { useQuickLogGuard, removeQuickLoggedRecord } from "@/hooks/use-quick-log-guard";
import { showUndoToast } from "@/components/medications/undo-toast";
import {
  NO_ESTIMATE_VALUE,
  estimateRecordSchema,
  normalizeAmountEstimate,
} from "@intake/core/record-schemas";
import { useFieldId, useOnLogged } from "@/components/log-form-scope";

const AMOUNT_OPTIONS = URINATION_AMOUNT_OPTIONS;

const theme = CARD_THEMES.urination;

export function UrinationCard() {
  const onLogged = useOnLogged();
  const fid = useFieldId();
  const { toast } = useToast();
  const settings = useSettings();
  const [showDetails, setShowDetails] = useState(false);
  const [amount, setAmount] = useState<string>(settings.urinationDefaultAmount);
  const [note, setNote] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());
  const [submittingAmount, setSubmittingAmount] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const quickLogGuard = useQuickLogGuard();
  const recentRecords = useUrinationRecords(5);
  const [todayStart, todayEnd] = useLogicalTodayRange();
  const todayCount = useUrinationRecordsByDateRange(todayStart, todayEnd).length;
  const addMutation = useAddUrination();
  const deleteMutation = useDeleteUrination();
  const updateMutation = useUpdateUrination();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Urination record removed", { undoToast: true });

  // Extra edit field (amountEstimate is record-specific)
  const [editAmountEstimate, setEditAmountEstimate] = useState("");

  const {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEditRecord<UrinationRecord>({
    onOpen: (record) => setEditAmountEstimate(record.amountEstimate || ""),
    // `null` clears the estimate / note (and the clear syncs).
    buildUpdates: (timestamp, note) => ({
      timestamp,
      amountEstimate: normalizeAmountEstimate(editAmountEstimate),
      note: note ?? null,
    }),
    mutateAsync: updateMutation.mutateAsync,
  });

  const latestRecord = recentRecords?.[0];

  const handleQuickLog = async (amountValue: string) => {
    // Ref guard + identical-tap window: a double tap must not log twice.
    if (!quickLogGuard.begin(amountValue)) return;
    setSubmittingAmount(amountValue);
    let succeeded = false;
    try {
      const record = await addMutation.mutateAsync({
        amountEstimate: amountValue,
        source: "manual",
      });
      succeeded = true;
      // One tap commits immediately, so offer Undo for a mis-tap.
      showUndoToast({
        title: "Logged",
        description: `Urination (${amountValue}) recorded`,
        onUndo: () => {
          quickLogGuard.reset();
          void removeQuickLoggedRecord("urination", record.id);
        },
      });
      onLogged();
    } catch {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    } finally {
      quickLogGuard.end(succeeded);
      setSubmittingAmount(null);
    }
  };

  const toggleDetails = () => {
    // The default time was captured at mount; refresh it on open so a PWA
    // left open for hours doesn't stamp the record with a stale time.
    if (!showDetails) {
      setDetailTime(getCurrentDateTimeLocal());
      setDetailError(null);
    }
    setShowDetails(!showDetails);
  };

  const handleSubmitDetails = async () => {
    let timestamp: number;
    try {
      timestamp = dateTimeLocalToTimestamp(detailTime);
    } catch {
      setDetailError("Invalid date/time");
      return;
    }
    const effectiveAmount = normalizeAmountEstimate(amount) ?? undefined;
    const parsed = estimateRecordSchema(Date.now()).safeParse({ timestamp, amountEstimate: effectiveAmount });
    if (!parsed.success) {
      setDetailError(parsed.error.issues[0]?.message ?? "Invalid values");
      return;
    }
    setDetailError(null);
    try {
      await addMutation.mutateAsync({
        timestamp,
        ...(effectiveAmount !== undefined && { amountEstimate: effectiveAmount }),
        ...(note && { note }),
        source: "manual",
      });
      toast({
        title: "Logged",
        description: "Urination recorded",
        variant: "success",
      });
      onLogged();
      setShowDetails(false);
      setAmount(settings.urinationDefaultAmount);
      setNote("");
      setDetailTime(getCurrentDateTimeLocal());
    } catch {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    }
  };

  return (
    <ModuleCard
      domain={theme.domain}
      icon={theme.icon}
      title={theme.label}
      data-testid="urination-card"
      right={
        latestRecord ? (
          <>
            <b>{todayCount} today</b>
            <br />
            last <WhenLabel timestamp={latestRecord.timestamp} />
          </>
        ) : null
      }
    >
      <div className="wc-quick3">
        {AMOUNT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={submittingAmount !== null}
            onClick={() => handleQuickLog(opt.value)}
          >
            {submittingAmount === opt.value ? (
              <Spinner className="size-4" label={opt.label} />
            ) : (
              opt.label
            )}
          </button>
        ))}
      </div>

      <SubToggle expanded={showDetails} onToggle={toggleDetails}>
        {showDetails ? "Hide details" : "Add details"}
      </SubToggle>

      {showDetails && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[0.8125rem] text-muted-foreground">Amount (optional)</Label>
            <Select value={amount || NO_ESTIMATE_VALUE} onValueChange={setAmount}>
              <SelectTrigger aria-label="Amount estimate">
                <SelectValue placeholder="Select estimate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ESTIMATE_VALUE}>No estimate</SelectItem>
                {AMOUNT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={fid("urination-note")} className="text-[0.8125rem] text-muted-foreground">Note (optional)</Label>
            <Textarea
              id={fid("urination-note")}
              placeholder="e.g. colour, urgency"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={fid("urination-time")} className="text-[0.8125rem] text-muted-foreground">When</Label>
            <Input
              id={fid("urination-time")}
              type="datetime-local"
              value={detailTime}
              onChange={(e) => setDetailTime(e.target.value)}
              max={getCurrentDateTimeLocal()}
            />
            {detailError && (
              <p className="text-sm text-destructive">{detailError}</p>
            )}
          </div>
          <Button
            onClick={handleSubmitDetails}
            disabled={addMutation.isPending}
            className="w-full"
          >
            {addMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              "Record with details"
            )}
          </Button>
        </div>
      )}

      {/* Recent History */}
      <RecentEntriesList
        records={recentRecords}
        deletingId={deletingId}
        onDelete={handleDelete}
        onEdit={openEdit}
        editingId={editingRecord?.id ?? null}
        renderLabel={(record) => (
          <span className="text-muted-foreground">{record.note}</span>
        )}
        renderValue={(record) => (
          <span className="capitalize">{record.amountEstimate || "—"}</span>
        )}
        renderEditForm={() => (
          <InlineEditFormShell timestamp={editTimestamp} onTimestampChange={setEditTimestamp} note={editNote} onNoteChange={setEditNote} onSave={() => handleEditSubmit()} onCancel={closeEdit}>
            <Select value={editAmountEstimate || NO_ESTIMATE_VALUE} onValueChange={setEditAmountEstimate}>
              <SelectTrigger aria-label="Amount estimate" className="h-8 text-sm">
                <SelectValue placeholder="Amount estimate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ESTIMATE_VALUE}>No estimate</SelectItem>
                {AMOUNT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </InlineEditFormShell>
        )}
      />
    </ModuleCard>
  );
}
