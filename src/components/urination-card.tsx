"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useEditRecord } from "@/hooks/use-edit-record";
import { useToast } from "@/hooks/use-toast";
import { type UrinationRecord } from "@/lib/db";
import { useUrinationRecords, useAddUrination, useDeleteUrination, useUpdateUrination } from "@/hooks/use-urination-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";
import { URINATION_AMOUNT_OPTIONS } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";

const AMOUNT_OPTIONS = URINATION_AMOUNT_OPTIONS;

const theme = CARD_THEMES.urination;
const Icon = theme.icon;

export function UrinationCard() {
  const { toast } = useToast();
  const settings = useSettings();
  const [showDetails, setShowDetails] = useState(false);
  const [amount, setAmount] = useState<string>(settings.urinationDefaultAmount);
  const [note, setNote] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());
  const [submittingAmount, setSubmittingAmount] = useState<string | null>(null);
  const recentRecords = useUrinationRecords(5);
  const isLoading = !recentRecords;
  const addMutation = useAddUrination();
  const deleteMutation = useDeleteUrination();
  const updateMutation = useUpdateUrination();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Urination record removed");

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
    buildUpdates: (timestamp, note) => ({
      timestamp,
      amountEstimate: editAmountEstimate || undefined,
      note,
    }),
    mutateAsync: updateMutation.mutateAsync,
  });

  const latestRecord = recentRecords?.[0];

  const handleQuickLog = async (amountValue: string) => {
    setSubmittingAmount(amountValue);
    try {
      await addMutation.mutateAsync({ amountEstimate: amountValue });
      toast({
        title: "Logged",
        description: `Urination (${amountValue}) recorded`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    } finally {
      setSubmittingAmount(null);
    }
  };

  const handleSubmitDetails = async () => {
    try {
      const timestamp = dateTimeLocalToTimestamp(detailTime);
      await addMutation.mutateAsync({
        timestamp,
        ...(amount && { amountEstimate: amount }),
        ...(note && { note }),
      });
      toast({
        title: "Logged",
        description: "Urination recorded",
        variant: "success",
      });
      setShowDetails(false);
      setAmount(settings.urinationDefaultAmount);
      setNote("");
      setDetailTime(getCurrentDateTimeLocal());
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card className={cn("relative overflow-hidden transition-all duration-300 bg-gradient-to-br", theme.gradient, theme.border)}>
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
            {isLoading ? (
              <div className={cn("h-6 w-20 rounded animate-pulse", theme.loadingBg)} />
            ) : latestRecord ? (
              <p className="text-xs text-muted-foreground">
                {formatDateTime(latestRecord.timestamp)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {AMOUNT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant="outline"
                  size="sm"
                  disabled={submittingAmount !== null}
                  className={cn("h-10", submittingAmount === opt.value && "opacity-70")}
                  onClick={() => handleQuickLog(opt.value)}
                >
                  {submittingAmount === opt.value ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    opt.label
                  )}
                </Button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground"
              onClick={() => setShowDetails(!showDetails)}
            >
              <span>Add details</span>
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>

            {showDetails && (
              <div className="p-3 rounded-lg bg-muted/50 border space-y-3">
                <div className="space-y-2">
                  <Label>Amount (optional)</Label>
                  <Select value={amount} onValueChange={setAmount}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select estimate" />
                    </SelectTrigger>
                    <SelectContent>
                      {AMOUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urination-note">Note (optional)</Label>
                  <Textarea
                    id="urination-note"
                    placeholder="e.g. colour, urgency"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-[60px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urination-time">When</Label>
                  <Input
                    id="urination-time"
                    type="datetime-local"
                    value={detailTime}
                    onChange={(e) => setDetailTime(e.target.value)}
                    max={getCurrentDateTimeLocal()}
                  />
                </div>
                <Button
                  onClick={handleSubmitDetails}
                  disabled={addMutation.isPending}
                  className={cn("w-full", theme.buttonBg)}
                >
                  {addMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Record with details"
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Recent History */}
          <RecentEntriesList
            records={recentRecords}
            deletingId={deletingId}
            onDelete={handleDelete}
            onEdit={openEdit}
            editingId={editingRecord?.id ?? null}
            borderColor={theme.border}
            renderEntry={(record) => (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">{formatDateTime(record.timestamp)}</span>
                {record.amountEstimate && (
                  <span className="text-xs font-medium capitalize">{record.amountEstimate}</span>
                )}
                {record.note && (
                  <span className="text-xs text-muted-foreground/70 truncate">
                    {record.note}
                  </span>
                )}
              </div>
            )}
            renderEditForm={() => (
              <div className="space-y-2">
                <Select value={editAmountEstimate} onValueChange={setEditAmountEstimate}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Amount estimate" />
                  </SelectTrigger>
                  <SelectContent>
                    {AMOUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
