"use client";

import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ErrorLogSource } from "@/lib/db";
import {
  clearErrorLogs,
  exportErrorLogs,
} from "@/lib/error-log-service";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2,
} from "lucide-react";

const SOURCES: Array<ErrorLogSource | "all"> = [
  "all",
  "window-error",
  "unhandled-rejection",
  "error-boundary",
  "console-error",
  "console-warn",
  "api-error",
];

const SOURCE_COLOR: Record<ErrorLogSource, string> = {
  "window-error": "text-red-600 dark:text-red-400",
  "unhandled-rejection": "text-red-600 dark:text-red-400",
  "error-boundary": "text-rose-600 dark:text-rose-400",
  "console-error": "text-orange-600 dark:text-orange-400",
  "console-warn": "text-amber-600 dark:text-amber-400",
  "api-error": "text-orange-600 dark:text-orange-400",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function ErrorLogViewer() {
  const [sourceFilter, setSourceFilter] = useState<ErrorLogSource | "all">(
    "all",
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const logs = useLiveQuery(
    () => db._errorLogs.orderBy("timestamp").reverse().limit(200).toArray(),
    [],
    [],
  );

  const filtered =
    sourceFilter === "all" ? logs : logs.filter((l) => l.source === sourceFilter);

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClear = useCallback(async () => {
    await clearErrorLogs();
    setShowClearConfirm(false);
  }, []);

  const handleExport = useCallback(async () => {
    const json = await exportErrorLogs();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `error-logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="space-y-3 min-w-0">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertOctagon className="h-4 w-4 shrink-0" />
          Error Logs ({filtered.length})
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <Select
            value={sourceFilter}
            onValueChange={(v) =>
              setSourceFilter(v as ErrorLogSource | "all")
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All sources" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleExport}
            disabled={logs.length === 0}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
          {showClearConfirm ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={handleClear}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setShowClearConfirm(true)}
              disabled={logs.length === 0}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[320px]">
        <div className="space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No errors captured.
            </p>
          )}
          {filtered.map((log) => {
            const isExpanded = expandedIds.has(log.id);
            const hasDetail = Boolean(
              log.stack || log.componentStack || log.route || log.userAgent,
            );
            return (
              <div
                key={log.id}
                className="border rounded px-2 py-1.5 text-xs"
              >
                <button
                  type="button"
                  className="flex items-start gap-2 w-full text-left"
                  onClick={() => toggle(log.id)}
                >
                  {hasDetail ? (
                    isExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0 mt-0.5" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 mt-0.5" />
                    )
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground shrink-0">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span
                        className={`font-mono shrink-0 ${SOURCE_COLOR[log.source]}`}
                      >
                        {log.source}
                      </span>
                    </div>
                    <div className="font-mono break-words whitespace-pre-wrap mt-0.5">
                      {log.message}
                    </div>
                  </div>
                </button>
                {isExpanded && hasDetail && (
                  <div className="mt-1 ml-5 space-y-1">
                    {log.route && (
                      <div className="text-[10px] text-muted-foreground">
                        Route: <span className="font-mono">{log.route}</span>
                      </div>
                    )}
                    {log.stack && (
                      <pre className="p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                        {log.stack}
                      </pre>
                    )}
                    {log.componentStack && (
                      <pre className="p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                        Component stack:{log.componentStack}
                      </pre>
                    )}
                    {log.userAgent && (
                      <div className="text-[10px] text-muted-foreground break-all">
                        UA: {log.userAgent}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
