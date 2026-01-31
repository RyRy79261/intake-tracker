"use client";

import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  History,
  Droplets,
  Sparkles,
  Trash2,
  Calendar,
  Clock,
  Loader2,
  Lock,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { type IntakeRecord } from "@/lib/db";
import { getRecordsByCursor } from "@/lib/intake-service";
import { useUpdateIntake, useDeleteIntake } from "@/hooks/use-intake-queries";
import { useToast } from "@/hooks/use-toast";
import { usePinProtected } from "@/hooks/use-pin-gate";
import { cn } from "@/lib/utils";

// Helper to convert timestamp to datetime-local format
function timestampToDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

// Helper to convert datetime-local value to timestamp
function dateTimeLocalToTimestamp(value: string): number {
  return new Date(value).getTime();
}

const PAGE_SIZE = 30;

// Group records by date
function groupRecordsByDate(records: IntakeRecord[]): Map<string, IntakeRecord[]> {
  const groups = new Map<string, IntakeRecord[]>();
  
  for (const record of records) {
    const date = new Date(record.timestamp);
    const dateKey = date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(record);
  }
  
  return groups;
}

// Format time from timestamp
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Format source for display
function formatSource(source?: string): string {
  if (!source) return "Manual";
  if (source === "manual") return "Manual";
  if (source === "voice") return "Voice";
  if (source.startsWith("food:")) {
    const food = source.replace("food:", "");
    return `Food: ${food}`;
  }
  return source;
}

interface RecordItemProps {
  record: IntakeRecord;
  onDelete: (id: string) => Promise<void>;
  onEdit: (record: IntakeRecord) => void;
  isDeleting: boolean;
}

function RecordItem({ record, onDelete, onEdit, isDeleting }: RecordItemProps) {
  const isWater = record.type === "water";
  const unit = isWater ? "ml" : "mg";
  
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border",
      isWater 
        ? "bg-sky-50/50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-800"
        : "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-full",
          isWater 
            ? "bg-sky-100 dark:bg-sky-900/50"
            : "bg-amber-100 dark:bg-amber-900/50"
        )}>
          {isWater ? (
            <Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div>
          <div className="font-medium">
            {record.amount} {unit}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {formatTime(record.timestamp)}
            <span className="text-muted-foreground/50">•</span>
            {formatSource(record.source)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={() => onEdit(record)}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() => onDelete(record.id)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function HistorySheet() {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { requirePin, showLockedUI } = usePinProtected();
  
  // Mutations
  const updateMutation = useUpdateIntake();
  const deleteMutation = useDeleteIntake();
  
  // Pagination state
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  // Edit dialog state
  const [editingRecord, setEditingRecord] = useState<IntakeRecord | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editTimestamp, setEditTimestamp] = useState("");

  // Load initial records when sheet opens
  const loadInitialRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getRecordsByCursor(undefined, PAGE_SIZE);
      setRecords(result.records);
      setNextCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not load history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load more records
  const loadMoreRecords = useCallback(async () => {
    if (!hasMore || isLoadingMore || nextCursor === null) return;
    
    setIsLoadingMore(true);
    try {
      const result = await getRecordsByCursor(nextCursor, PAGE_SIZE);
      setRecords(prev => [...prev, ...result.records]);
      setNextCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not load more records",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextCursor, toast]);
  
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      // Remove from local state
      setRecords(prev => prev.filter(r => r.id !== id));
      toast({
        title: "Entry deleted",
        description: "The intake record has been removed",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not delete the entry",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }, [toast, deleteMutation]);

  // Open edit dialog for a record
  const handleEdit = useCallback((record: IntakeRecord) => {
    setEditingRecord(record);
    setEditAmount(record.amount.toString());
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
  }, []);

  // Submit edit changes
  const handleEditSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    
    const newAmount = parseInt(editAmount, 10);
    const newTimestamp = dateTimeLocalToTimestamp(editTimestamp);
    
    if (isNaN(newAmount) || newAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    
    // Close dialog immediately (optimistic)
    const recordToUpdate = editingRecord;
    setEditingRecord(null);
    
    try {
      await updateMutation.mutateAsync({
        id: recordToUpdate.id,
        updates: { amount: newAmount, timestamp: newTimestamp },
      });
      
      // Update local state and re-sort by timestamp (descending)
      setRecords(prev => {
        const updated = prev.map(r => 
          r.id === recordToUpdate.id 
            ? { ...r, amount: newAmount, timestamp: newTimestamp }
            : r
        );
        // Re-sort by timestamp descending to maintain correct order
        return updated.sort((a, b) => b.timestamp - a.timestamp);
      });
      
      toast({
        title: "Entry updated",
        description: "The intake record has been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not update the entry",
        variant: "destructive",
      });
    }
  }, [editingRecord, editAmount, editTimestamp, toast, updateMutation]);

  // Handle sheet open with PIN check
  const handleOpenChange = useCallback(async (open: boolean) => {
    if (open) {
      // Request PIN before opening
      const unlocked = await requirePin();
      if (unlocked) {
        setIsOpen(true);
        // Reset and load initial records
        setRecords([]);
        setNextCursor(null);
        setHasMore(true);
        loadInitialRecords();
      }
    } else {
      setIsOpen(false);
    }
  }, [requirePin, loadInitialRecords]);
  
  const groupedRecords = groupRecordsByDate(records);
  const dateGroups = Array.from(groupedRecords.entries());
  
  return (
    <>
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0 relative">
          <History className="w-5 h-5" />
          {showLockedUI && (
            <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-amber-500" />
          )}
          <span className="sr-only">History</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Intake History</SheetTitle>
          <SheetDescription>
            View and manage your logged intake entries
          </SheetDescription>
        </SheetHeader>
        
        <div className="py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : records && records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No intake records yet</p>
              <p className="text-sm mt-1">Start logging your intake to see history here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {dateGroups.map(([date, dayRecords]: [string, IntakeRecord[]]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {date}
                    <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                      {dayRecords.length} {dayRecords.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dayRecords.map((record) => (
                      <RecordItem
                        key={record.id}
                        record={record}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        isDeleting={deletingId === record.id}
                      />
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Load more button */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={loadMoreRecords}
                    disabled={isLoadingMore}
                    className="gap-2"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Load More
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Edit Record Dialog */}
    <Dialog open={editingRecord !== null} onOpenChange={(open) => !open && setEditingRecord(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {editingRecord?.type === "water" ? "Water" : "Salt"} Entry
          </DialogTitle>
          <DialogDescription>
            Update the amount or time for this entry
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-amount">
              Amount ({editingRecord?.type === "water" ? "ml" : "mg"})
            </Label>
            <Input
              id="edit-amount"
              type="number"
              min="1"
              step="1"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="Enter amount"
              className="text-lg h-12"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-timestamp">Time</Label>
            <Input
              id="edit-timestamp"
              type="datetime-local"
              value={editTimestamp}
              onChange={(e) => setEditTimestamp(e.target.value)}
              className="text-sm"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRecord(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending || !editAmount || parseInt(editAmount, 10) <= 0}
              className={cn(
                editingRecord?.type === "water"
                  ? "bg-sky-600 hover:bg-sky-700"
                  : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
