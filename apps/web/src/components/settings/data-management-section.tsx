"use client";

import { useRef, useState } from "react";
import { Button } from "@intake/ui/button";
import { Download, Upload, AlertTriangle } from "lucide-react";
import {
  useDownloadBackup,
  useUploadBackup,
  type ImportResult,
} from "@/hooks/use-backup-queries";
import { ConflictReviewDrawer } from "@/components/settings/conflict-review-drawer";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function DataManagementSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(
    null
  );
  const [showConflictDrawer, setShowConflictDrawer] = useState(false);
  const [showExportWarning, setShowExportWarning] = useState(false);

  const downloadMut = useDownloadBackup();
  const uploadMut = useUploadBackup();

  const storageMode = useSettingsStore((s) => s.storageMode);
  const initialSyncComplete = useSyncStatusStore((s) => s.initialSyncComplete);
  // Export reads only from local IndexedDB. In cloud-sync mode, until the
  // first full pull finishes, this device may not hold the entire cloud
  // dataset — exporting now would silently produce an incomplete file.
  const exportMayBeIncomplete =
    storageMode === "cloud-sync" && !initialSyncComplete;

  const handleExport = () => {
    if (exportMayBeIncomplete) {
      setShowExportWarning(true);
      return;
    }
    downloadMut.mutate();
  };

  const handleConfirmExport = () => {
    setShowExportWarning(false);
    downloadMut.mutate();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowImportConfirm(true);
  };

  const handleConfirmImport = () => {
    if (!pendingFile) return;
    uploadMut.mutate(
      { file: pendingFile, mode: "merge" },
      {
        onSuccess: (data: ImportResult) => {
          setLastImportResult(data);
        },
        onSettled: () => {
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          setShowImportConfirm(false);
          setPendingFile(null);
        },
      }
    );
  };

  const handleCancelImport = () => {
    setShowImportConfirm(false);
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };


  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Data Management</h3>
      <div className="space-y-3 pl-0">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleExport}
          disabled={downloadMut.isPending}
        >
          <Upload className="w-4 h-4" />
          {downloadMut.isPending ? "Exporting..." : "Export Data"}
        </Button>

        {showExportWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Cloud Sync hasn&apos;t finished downloading all your data to
                this device yet. Exporting now may produce an incomplete file.
                Wait until the Storage section shows &ldquo;Full copy of your
                data on this device&rdquo;, or export anyway.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowExportWarning(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleConfirmExport}
                disabled={downloadMut.isPending}
              >
                {downloadMut.isPending ? "Exporting..." : "Export Anyway"}
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
        >
          <Download className="w-4 h-4" />
          {uploadMut.isPending ? "Importing..." : "Import Data"}
        </Button>

        {showImportConfirm && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This will merge backup data with your existing data. New and
                deleted records will be restored, duplicates skipped.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCancelImport}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleConfirmImport}
                disabled={uploadMut.isPending}
              >
                {uploadMut.isPending ? "Importing..." : "Continue Import"}
              </Button>
            </div>
          </div>
        )}

        {lastImportResult && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm text-muted-foreground">
              Last import: {lastImportResult.totalImported} new, {lastImportResult.skipped}{" "}
              skipped, {lastImportResult.conflicts.length} conflicts
            </p>
            {lastImportResult.conflicts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConflictDrawer(true)}
              >
                Review {lastImportResult.conflicts.length} conflicts
              </Button>
            )}
          </div>
        )}
        {/* Deleting data lives in one place: the "Delete data" controls in
            Storage settings (audit analytics-history-export#2). */}
      </div>

      <ConflictReviewDrawer
        open={showConflictDrawer}
        onOpenChange={setShowConflictDrawer}
        conflicts={lastImportResult?.conflicts ?? []}
        onResolved={() => {
          setShowConflictDrawer(false);
          setLastImportResult(null);
        }}
      />
    </div>
  );
}
