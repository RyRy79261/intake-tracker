"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Trash2, AlertTriangle } from "lucide-react";
import {
  useDownloadBackup,
  useUploadBackup,
  useClearAllData,
  type ImportResult,
} from "@/hooks/use-backup-queries";
import { ConflictReviewDrawer } from "@/components/settings/conflict-review-drawer";

export function DataManagementSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(
    null
  );
  const [showConflictDrawer, setShowConflictDrawer] = useState(false);

  const downloadMut = useDownloadBackup();
  const uploadMut = useUploadBackup();
  const clearMut = useClearAllData();

  const handleExport = () => {
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

  const handleClearData = () => {
    clearMut.mutate(undefined, {
      onSuccess: () => setShowClearConfirm(false),
    });
  };

  const importTotal = lastImportResult
    ? lastImportResult.intakeImported +
      lastImportResult.weightImported +
      lastImportResult.bpImported +
      lastImportResult.eatingImported +
      lastImportResult.urinationImported +
      lastImportResult.defecationImported +
      lastImportResult.substanceImported +
      lastImportResult.prescriptionsImported +
      lastImportResult.phasesImported +
      lastImportResult.schedulesImported +
      lastImportResult.inventoryItemsImported +
      lastImportResult.inventoryTransactionsImported +
      lastImportResult.doseLogsImported +
      lastImportResult.titrationPlansImported +
      lastImportResult.dailyNotesImported +
      lastImportResult.auditLogsImported
    : 0;

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
          <Download className="w-4 h-4" />
          {downloadMut.isPending ? "Exporting..." : "Export Data"}
        </Button>

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
          <Upload className="w-4 h-4" />
          {uploadMut.isPending ? "Importing..." : "Import Data"}
        </Button>

        {showImportConfirm && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This will merge backup data with your existing data. New records
                will be added, duplicates skipped.
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
              Last import: {importTotal} new, {lastImportResult.skipped}{" "}
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

        {!showClearConfirm ? (
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="w-4 h-4" />
            Clear All Data
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowClearConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleClearData}
            >
              Confirm Delete
            </Button>
          </div>
        )}
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
