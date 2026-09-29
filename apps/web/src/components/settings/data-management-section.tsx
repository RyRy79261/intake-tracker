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
import {
  SubHead,
  btnClass,
  plainboxClass,
  warnboxClass,
} from "@/components/settings/settings-kit";

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
    <div className="flex flex-col gap-2.5">
      <SubHead>Data Management</SubHead>
      <Button
        variant="outline"
        className={`${btnClass} w-full justify-start`}
        onClick={handleExport}
        disabled={downloadMut.isPending}
      >
        <Upload className="h-4 w-4" />
        {downloadMut.isPending ? "Exporting..." : "Export Data"}
      </Button>

      {showExportWarning && (
        <div role="alert" className={warnboxClass}>
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-sodium" aria-hidden="true" />
            <span>
              Cloud Sync hasn&apos;t finished downloading all your data to
              this device yet. Exporting now may produce an incomplete file.
              Wait until the Storage section shows &ldquo;Full copy of your
              data on this device&rdquo;, or export anyway.
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className={btnClass} onClick={() => setShowExportWarning(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmExport} disabled={downloadMut.isPending}>
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
        className={`${btnClass} w-full justify-start`}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMut.isPending}
      >
        <Download className="h-4 w-4" />
        {uploadMut.isPending ? "Importing..." : "Import Data"}
      </Button>

      {showImportConfirm && (
        <div role="alert" className={warnboxClass}>
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-sodium" aria-hidden="true" />
            <span>
              This will merge backup data with your existing data. New and
              deleted records will be restored, duplicates skipped.
            </span>
          </p>
          {pendingFile && (
            <p className="font-mono text-xs text-muted-foreground">{pendingFile.name}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className={btnClass} onClick={handleCancelImport}>
              Cancel
            </Button>
            <Button onClick={handleConfirmImport} disabled={uploadMut.isPending}>
              {uploadMut.isPending ? "Importing..." : "Continue Import"}
            </Button>
          </div>
        </div>
      )}

      {lastImportResult && (
        <div className={plainboxClass}>
          <p className="text-muted-foreground">
            Last import: {lastImportResult.totalImported} new, {lastImportResult.skipped}{" "}
            skipped, {lastImportResult.conflicts.length} conflicts
          </p>
          {lastImportResult.conflicts.length > 0 && (
            <Button
              variant="outline"
              className={`${btnClass} self-start`}
              onClick={() => setShowConflictDrawer(true)}
            >
              Review {lastImportResult.conflicts.length} conflicts
            </Button>
          )}
        </div>
      )}
      {/* Deleting data lives in one place: the "Delete data" controls in
          Storage settings (audit analytics-history-export#2). */}

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
