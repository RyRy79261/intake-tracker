"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type AuditAction } from "@/lib/db";
import {
  recalculateAllStock,
  getCurrentStock,
} from "@/lib/inventory-service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bug,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Trash2,
  Database,
  FileText,
  Package,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Audit action options for filter
// ---------------------------------------------------------------------------

const AUDIT_ACTIONS: AuditAction[] = [
  "ai_parse_request",
  "ai_parse_success",
  "ai_parse_error",
  "data_export",
  "data_import",
  "data_clear",
  "settings_change",
  "api_key_set",
  "api_key_clear",
  "pin_set",
  "pin_verify_success",
  "pin_verify_failure",
  "dose_taken",
  "dose_skipped",
  "dose_rescheduled",
  "prescription_added",
  "prescription_updated",
  "inventory_adjusted",
  "phase_activated",
  "validation_error",
  "dose_untaken",
  "prescription_deleted",
  "phase_completed",
  "phase_started",
  "stock_recalculated",
  "inventory_added",
  "inventory_deleted",
];

// ---------------------------------------------------------------------------
// Table names for raw record viewer
// ---------------------------------------------------------------------------

const TABLE_NAMES = [
  "intakeRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "prescriptions",
  "medicationPhases",
  "phaseSchedules",
  "inventoryItems",
  "inventoryTransactions",
  "doseLogs",
  "dailyNotes",
  "auditLogs",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function parseDetails(details?: string): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Section 1: Audit Log Viewer
// ---------------------------------------------------------------------------

function AuditLogViewer() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const auditLogs = useLiveQuery(
    () => db.auditLogs.orderBy("timestamp").reverse().limit(100).toArray(),
    [],
    [],
  );

  const filteredLogs =
    actionFilter === "all"
      ? auditLogs
      : auditLogs.filter((log) => log.action === actionFilter);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(async () => {
    await db.auditLogs.clear();
    setShowClearConfirm(false);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />
          Audit Logs ({filteredLogs.length})
        </div>
        <div className="flex items-center gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {AUDIT_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showClearConfirm ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={handleClearAll}
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
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-1">
          {filteredLogs.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No audit logs found.
            </p>
          )}
          {filteredLogs.map((log) => {
            const isExpanded = expandedIds.has(log.id);
            const details = parseDetails(log.details);
            return (
              <div
                key={log.id}
                className="border rounded px-2 py-1.5 text-xs"
              >
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleExpanded(log.id)}
                >
                  {details ? (
                    isExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="text-muted-foreground shrink-0">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className="font-mono font-medium">{log.action}</span>
                </button>
                {isExpanded && details && (
                  <pre className="mt-1 ml-5 p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(details, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Stock Management
// ---------------------------------------------------------------------------

interface StockResult {
  updated: number;
  drifted: number;
  items: Array<{
    id: string;
    brandName: string;
    oldStock: number;
    newStock: number;
  }>;
}

interface StockComparison {
  id: string;
  brandName: string;
  cachedStock: number;
  derivedStock: number;
}

function StockManagement() {
  const [recalcResult, setRecalcResult] = useState<StockResult | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [stockComparisons, setStockComparisons] = useState<StockComparison[]>(
    [],
  );
  const [isLoadingComparisons, setIsLoadingComparisons] = useState(false);

  const activeItems = useLiveQuery(
    () => db.inventoryItems.where("isActive").equals(1).toArray(),
    [],
    [],
  );

  const handleRecalculate = useCallback(async () => {
    setIsRecalculating(true);
    try {
      const result = await recalculateAllStock();
      setRecalcResult(result);
    } finally {
      setIsRecalculating(false);
    }
  }, []);

  const handleLoadComparisons = useCallback(async () => {
    setIsLoadingComparisons(true);
    try {
      const comparisons: StockComparison[] = [];
      for (const item of activeItems) {
        const derived = await getCurrentStock(item.id);
        comparisons.push({
          id: item.id,
          brandName: item.brandName,
          cachedStock: item.currentStock ?? 0,
          derivedStock: derived,
        });
      }
      setStockComparisons(comparisons);
    } finally {
      setIsLoadingComparisons(false);
    }
  }, [activeItems]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Package className="h-4 w-4" />
        Stock Management
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleRecalculate}
          disabled={isRecalculating}
        >
          <RefreshCw
            className={`h-3 w-3 mr-1 ${isRecalculating ? "animate-spin" : ""}`}
          />
          Recalculate All Stock
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleLoadComparisons}
          disabled={isLoadingComparisons}
        >
          Compare Cached vs Derived
        </Button>
      </div>

      {recalcResult && (
        <Card className="p-3 text-xs space-y-2">
          <div className="font-medium">
            Recalculation Result: {recalcResult.updated} items updated,{" "}
            {recalcResult.drifted} drifted
          </div>
          {recalcResult.items.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-amber-600 dark:text-amber-400">
                Drifted Items:
              </div>
              {recalcResult.items.map((item) => (
                <div key={item.id} className="ml-2 font-mono">
                  {item.brandName}: {item.oldStock} &rarr; {item.newStock}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {stockComparisons.length > 0 && (
        <Card className="p-3 text-xs">
          <div className="font-medium mb-2">
            Stock Comparison ({stockComparisons.length} active items)
          </div>
          <div className="space-y-1">
            {stockComparisons.map((comp) => {
              const isDrifted =
                Math.abs(comp.cachedStock - comp.derivedStock) > 0.001;
              return (
                <div
                  key={comp.id}
                  className={`font-mono flex justify-between ${isDrifted ? "text-amber-600 dark:text-amber-400" : ""}`}
                >
                  <span>{comp.brandName}</span>
                  <span>
                    cached: {comp.cachedStock} | derived: {comp.derivedStock}
                    {isDrifted ? " (DRIFT)" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Raw Record Viewer
// ---------------------------------------------------------------------------

function RawRecordViewer() {
  const [selectedTable, setSelectedTable] = useState<string>(TABLE_NAMES[0]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const records = useLiveQuery(
    async () => {
      const table = db.table(selectedTable);
      const count = await table.count();
      // Get 50 most recent by sorting by createdAt descending (fallback to reverse order)
      let items: Record<string, unknown>[];
      try {
        items = await table.orderBy("createdAt").reverse().limit(50).toArray();
      } catch {
        // Table may not have createdAt index -- fall back to raw limit
        items = await table.reverse().limit(50).toArray();
      }
      return { count, items };
    },
    [selectedTable],
    { count: 0, items: [] as Record<string, unknown>[] },
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Database className="h-4 w-4" />
        Raw Records
      </div>

      <div className="flex items-center gap-2">
        <Select value={selectedTable} onValueChange={setSelectedTable}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLE_NAMES.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {records.count} total records
        </span>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-1">
          {records.items.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No records in this table.
            </p>
          )}
          {records.items.map((record) => {
            const id = (record.id as string) ?? String(Math.random());
            const isExpanded = expandedIds.has(id);
            return (
              <div key={id} className="border rounded px-2 py-1.5 text-xs">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleExpanded(id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <span className="font-mono truncate">{id}</span>
                  {typeof record.timestamp === "number" && (
                    <span className="text-muted-foreground shrink-0">
                      {formatTimestamp(record.timestamp)}
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <pre className="mt-1 ml-5 p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(record, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Debug Panel
// ---------------------------------------------------------------------------

export function DebugPanel() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <Bug className="w-4 h-4" />
          Debug Panel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Debug Panel</DialogTitle>
          <DialogDescription>
            Audit logs, stock management, and raw database records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section 1: Audit Log Viewer */}
          <Collapsible
            open={activeSection === "audit"}
            onOpenChange={(open) =>
              setActiveSection(open ? "audit" : null)
            }
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between h-9 text-sm"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Audit Logs
                </span>
                {activeSection === "audit" ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <AuditLogViewer />
            </CollapsibleContent>
          </Collapsible>

          {/* Section 2: Stock Management */}
          <Collapsible
            open={activeSection === "stock"}
            onOpenChange={(open) =>
              setActiveSection(open ? "stock" : null)
            }
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between h-9 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Stock Management
                </span>
                {activeSection === "stock" ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <StockManagement />
            </CollapsibleContent>
          </Collapsible>

          {/* Section 3: Raw Record Viewer */}
          <Collapsible
            open={activeSection === "raw"}
            onOpenChange={(open) =>
              setActiveSection(open ? "raw" : null)
            }
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between h-9 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Raw Records
                </span>
                {activeSection === "raw" ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <RawRecordViewer />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
