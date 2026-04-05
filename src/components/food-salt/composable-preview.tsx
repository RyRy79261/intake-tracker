"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Utensils, Droplets, Sparkles, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PreviewRecord {
  type: "eating" | "water" | "salt";
  description?: string;
  grams?: number;
  amountMl?: number;
  amountMg?: number;
  expanded: boolean;
}

interface ComposablePreviewProps {
  records: PreviewRecord[];
  onRecordsChange: (records: PreviewRecord[]) => void;
  originalInputText: string;
  reasoning: string | null;
  onConfirm: () => void;
  onTryAgain: () => void;
  isConfirming: boolean;
}

function getRecordIcon(type: PreviewRecord["type"]) {
  switch (type) {
    case "eating":
      return Utensils;
    case "water":
      return Droplets;
    case "salt":
      return Sparkles;
  }
}

function getRecordLabel(type: PreviewRecord["type"]): string {
  switch (type) {
    case "eating":
      return "Eating";
    case "water":
      return "Water";
    case "salt":
      return "Sodium";
  }
}

function getRecordSummary(record: PreviewRecord): string {
  switch (record.type) {
    case "eating":
      return record.description || "";
    case "water":
      return record.amountMl ? `${record.amountMl} ml` : "";
    case "salt":
      return record.amountMg ? `${record.amountMg} mg` : "";
  }
}

export function ComposablePreview({
  records,
  onRecordsChange,
  originalInputText,
  reasoning,
  onConfirm,
  onTryAgain,
  isConfirming,
}: ComposablePreviewProps) {
  const handleRemove = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onRecordsChange(records.filter((_, i) => i !== index));
  };

  const handleToggleExpand = (index: number) => {
    onRecordsChange(
      records.map((r, i) =>
        i === index ? { ...r, expanded: !r.expanded } : r
      )
    );
  };

  const updateRecord = (index: number, updater: (record: PreviewRecord) => PreviewRecord) => {
    onRecordsChange(
      records.map((r, i) => (i === index ? updater(r) : r))
    );
  };

  if (records.length === 0) {
    return (
      <div className="space-y-3 mt-3">
        <p className="text-sm font-medium mb-2">{originalInputText}</p>
        <p className="text-sm text-muted-foreground">
          No records to save. Try again or add details manually.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Button variant="outline" className="h-12" onClick={onTryAgain}>
            Try Again
          </Button>
          <Button
            className="h-12 bg-orange-600 hover:bg-orange-700"
            onClick={onConfirm}
            disabled
          >
            Confirm All
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      <p className="text-sm font-medium mb-2">{originalInputText}</p>

      {records.map((record, index) => {
        const RecordIcon = getRecordIcon(record.type);
        const label = getRecordLabel(record.type);
        const summary = getRecordSummary(record);

        return (
          <Collapsible
            key={`${record.type}-${index}`}
            open={record.expanded}
            onOpenChange={() => handleToggleExpand(index)}
          >
            <div className="p-3 rounded-lg bg-muted/50 border">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <RecordIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                  {summary && (
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {summary}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => handleRemove(index, e)}
                  className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
                  aria-label={`Remove ${record.type} record`}
                >
                  <X className="w-4 h-4" />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3 space-y-2">
                {record.type === "eating" && (
                  <>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`preview-eating-desc-${index}`}
                        className="text-xs"
                      >
                        Description
                      </Label>
                      <Input
                        id={`preview-eating-desc-${index}`}
                        value={record.description ?? ""}
                        onChange={(e) =>
                          updateRecord(index, (r) => ({ ...r, description: e.target.value }))
                        }
                        placeholder="What was eaten"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`preview-eating-grams-${index}`}
                        className="text-xs"
                      >
                        Grams (optional)
                      </Label>
                      <Input
                        id={`preview-eating-grams-${index}`}
                        type="number"
                        min="1"
                        value={record.grams ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          updateRecord(index, (r) => {
                            const next = { ...r };
                            if (val !== undefined) { next.grams = val; } else { delete next.grams; }
                            return next;
                          });
                        }}
                        placeholder="e.g. 250"
                        className="h-8 text-sm"
                      />
                    </div>
                  </>
                )}

                {record.type === "water" && (
                  <div className="space-y-1">
                    <Label
                      htmlFor={`preview-water-ml-${index}`}
                      className="text-xs"
                    >
                      Amount (ml)
                    </Label>
                    <Input
                      id={`preview-water-ml-${index}`}
                      type="number"
                      min="1"
                      value={record.amountMl ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        updateRecord(index, (r) => {
                          const next = { ...r };
                          if (val !== undefined) { next.amountMl = val; } else { delete next.amountMl; }
                          return next;
                        });
                      }}
                      placeholder="ml"
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {record.type === "salt" && (
                  <div className="space-y-1">
                    <Label
                      htmlFor={`preview-salt-mg-${index}`}
                      className="text-xs"
                    >
                      Amount (mg)
                    </Label>
                    <Input
                      id={`preview-salt-mg-${index}`}
                      type="number"
                      min="1"
                      value={record.amountMg ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        updateRecord(index, (r) => {
                          const next = { ...r };
                          if (val !== undefined) { next.amountMg = val; } else { delete next.amountMg; }
                          return next;
                        });
                      }}
                      placeholder="mg"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {reasoning && (
        <p className="text-xs italic text-muted-foreground line-clamp-2">
          {reasoning}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Button variant="outline" className="h-12" onClick={onTryAgain}>
          Try Again
        </Button>
        <Button
          className={cn("h-12 bg-orange-600 hover:bg-orange-700")}
          onClick={onConfirm}
          disabled={isConfirming || records.length === 0}
        >
          {isConfirming ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Confirm All"
          )}
        </Button>
      </div>
    </div>
  );
}
