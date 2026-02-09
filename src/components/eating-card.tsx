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
import { Loader2, Check, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import { RecentEntriesList } from "@/components/recent-entries-list";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";
import { useToast } from "@/hooks/use-toast";
import { useEatingRecords, useAddEating, useDeleteEating } from "@/hooks/use-eating-queries";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatDateTime,
} from "@/lib/date-utils";

const theme = CARD_THEMES.eating;
const Icon = theme.icon;

export function EatingCard() {
  const { toast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailNote, setDetailNote] = useState("");
  const [detailTime, setDetailTime] = useState(getCurrentDateTimeLocal());
  const { data: recentRecords, isLoading } = useEatingRecords(5);
  const addMutation = useAddEating();
  const deleteMutation = useDeleteEating();
  const { deletingId, handleDelete } = useDeleteWithToast(deleteMutation, "Eating record removed");

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
                  I ate
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
              Add details (what I ate)
            </Button>
          </div>

          {/* Recent History */}
          <RecentEntriesList
            records={recentRecords}
            deletingId={deletingId}
            onDelete={handleDelete}
            borderColor={theme.border}
            renderEntry={(record) => (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">{formatDateTime(record.timestamp)}</span>
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
