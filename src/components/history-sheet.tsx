"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  History,
  Droplets,
  Sparkles,
  Trash2,
  Calendar,
  Clock,
  Loader2,
} from "lucide-react";
import { db, type IntakeRecord } from "@/lib/db";
import { deleteIntakeRecord } from "@/lib/intake-service";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  isDeleting: boolean;
}

function RecordItem({ record, onDelete, isDeleting }: RecordItemProps) {
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
  );
}

export function HistorySheet() {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Live query for all records, sorted by timestamp descending
  const records = useLiveQuery(
    () => db.intakeRecords.orderBy("timestamp").reverse().toArray(),
    []
  );
  
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteIntakeRecord(id);
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
  }, [toast]);
  
  const isLoading = records === undefined;
  const groupedRecords = records ? groupRecordsByDate(records) : new Map();
  const dateGroups = Array.from(groupedRecords.entries());
  
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0">
          <History className="w-5 h-5" />
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
              {dateGroups.map(([date, dayRecords]) => (
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
                        isDeleting={deletingId === record.id}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
