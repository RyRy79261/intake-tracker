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
import { Droplet, Loader2, Check, PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUrinationRecords, useAddUrination, useDeleteUrination } from "@/hooks/use-urination-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

const AMOUNT_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

export function UrinationCard() {
  const { toast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: recentRecords, isLoading } = useUrinationRecords(5);
  const addMutation = useAddUrination();
  const deleteMutation = useDeleteUrination();

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
      <Card className="relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 border-violet-200 dark:border-violet-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50">
                <Droplet className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="font-semibold text-lg uppercase tracking-wide">
                Urination
              </span>
            </div>
            {isLoading ? (
              <div className="h-6 w-20 bg-violet-200 dark:bg-violet-800 rounded animate-pulse" />
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
              className="w-full h-11 bg-violet-600 hover:bg-violet-700"
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
              className="w-full border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300"
              onClick={handleOpenDetails}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add details
            </Button>
          </div>

          {/* Recent History */}
          {recentRecords && recentRecords.length > 0 && (
            <div className="mt-4 pt-4 border-t border-violet-200 dark:border-violet-800">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
              <div className="space-y-1">
                {recentRecords.slice(0, 3).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between text-sm py-1"
                  >
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-600 shrink-0"
                      onClick={async () => {
                        setDeletingId(record.id);
                        try {
                          await deleteMutation.mutateAsync(record.id);
                          toast({ title: "Entry deleted", description: "Urination record removed" });
                        } catch {
                          toast({ title: "Error", description: "Could not delete", variant: "destructive" });
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                      disabled={deletingId === record.id}
                    >
                      {deletingId === record.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
              className="w-full bg-violet-600 hover:bg-violet-700"
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
