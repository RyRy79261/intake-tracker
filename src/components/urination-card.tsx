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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Check, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
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

const AMOUNT_OPTIONS = URINATION_AMOUNT_OPTIONS;

const theme = CARD_THEMES.urination;
const Icon = theme.icon;

export function UrinationCard() {
  const { toast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());
  const { data: recentRecords, isLoading } = useUrinationRecords(5);
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

  const handleLogNow = async () => {
    try {
      await addMutation.mutateAsync({});
      toast({
        title: "Logged",
        description: "Urination recorded",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    }
  };

  const handleOpenDetails = () => {
    setAmount("");
    setNote("");
    setDetailTime(getCurrentDateTimeLocal());
    setDetailsOpen(true);
  };

  const handleSubmitDetails = async () => {
    try {
      const timestamp = dateTimeLocalToTimestamp(detailTime);
      await addMutation.mutateAsync({
        timestamp,
        amountEstimate: amount || undefined,
        note: note || undefined,
      });
      toast({
        title: "Logged",
        description: "Urination recorded",
        variant: "success",
      });
      setDetailsOpen(false);
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
            <Button
              onClick={handleLogNow}
              disabled={addMutation.isPending}
              className={cn("w-full h-11", theme.buttonBg)}
            >
              {addMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  I urinated
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn("w-full", theme.outlineBorder, theme.outlineText)}
              onClick={handleOpenDetails}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add details
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
          />
        </CardContent>
      </Card>

      <EditUrinationDialog
        record={editingRecord}
        onClose={closeEdit}
        onSubmit={handleEditSubmit}
        timestamp={editTimestamp}
        onTimestampChange={setEditTimestamp}
        amount={editAmountEstimate}
        onAmountChange={setEditAmountEstimate}
        note={editNote}
        onNoteChange={setEditNote}
      />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log with details</DialogTitle>
            <DialogDescription>
              Optionally add amount, a note, and when it happened.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                "Record"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
