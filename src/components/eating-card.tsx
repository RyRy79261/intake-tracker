"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Utensils, Loader2, Check, PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEatingRecords, useAddEating, useDeleteEating } from "@/hooks/use-eating-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

export function EatingCard() {
  const { toast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailNote, setDetailNote] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: recentRecords, isLoading } = useEatingRecords(5);
  const addMutation = useAddEating();
  const deleteMutation = useDeleteEating();

  const latestRecord = recentRecords?.[0];

  const handleLogNow = async () => {
    try {
      await addMutation.mutateAsync({});
      toast({
        title: "Logged",
        description: "Eating event recorded",
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
    setDetailNote("");
    setDetailTime(getCurrentDateTimeLocal());
    setDetailsOpen(true);
  };

  const handleSubmitDetails = async () => {
    try {
      const timestamp = dateTimeLocalToTimestamp(detailTime);
      await addMutation.mutateAsync({ timestamp, note: detailNote || undefined });
      toast({
        title: "Logged",
        description: detailNote ? "Meal with details recorded" : "Eating event recorded",
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
      <Card className="relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40 border-orange-200 dark:border-orange-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/50">
                <Utensils className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="font-semibold text-lg uppercase tracking-wide">
                Eating
              </span>
            </div>
            {isLoading ? (
              <div className="h-6 w-20 bg-orange-200 dark:bg-orange-800 rounded animate-pulse" />
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
              className="w-full h-11 bg-orange-600 hover:bg-orange-700"
            >
              {addMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  I ate
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300"
              onClick={handleOpenDetails}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add details (what I ate)
            </Button>
          </div>

          {/* Recent History */}
          {recentRecords && recentRecords.length > 0 && (
            <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-800">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
              <div className="space-y-1">
                {recentRecords.slice(0, 3).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground shrink-0">{formatDateTime(record.timestamp)}</span>
                      {record.note && (
                        <span className="text-xs text-muted-foreground/70 truncate">
                          {record.note}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete entry"
                      className="h-6 w-6 text-muted-foreground hover:text-red-600 shrink-0"
                      onClick={async () => {
                        setDeletingId(record.id);
                        try {
                          await deleteMutation.mutateAsync(record.id);
                          toast({ title: "Entry deleted", description: "Eating record removed" });
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
            <DialogTitle>Log meal with details</DialogTitle>
            <DialogDescription>
              Optionally add what you ate and when.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eating-note">What I ate (optional)</Label>
              <Textarea
                id="eating-note"
                placeholder="e.g. Sandwich, apple, water"
                value={detailNote}
                onChange={(e) => setDetailNote(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eating-time">When</Label>
              <Input
                id="eating-time"
                type="datetime-local"
                value={detailTime}
                onChange={(e) => setDetailTime(e.target.value)}
                max={getCurrentDateTimeLocal()}
              />
            </div>
            <Button
              onClick={handleSubmitDetails}
              disabled={addMutation.isPending}
              className="w-full bg-orange-600 hover:bg-orange-700"
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
