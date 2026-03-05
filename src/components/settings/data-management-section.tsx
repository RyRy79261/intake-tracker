"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Trash2 } from "lucide-react";
import { useDownloadBackup, useUploadBackup, useClearAllData } from "@/hooks/use-backup-queries";
import { useState } from "react";

export function DataManagementSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const downloadMut = useDownloadBackup();
  const uploadMut = useUploadBackup();
  const clearMut = useClearAllData();

  const handleExport = () => {
    downloadMut.mutate();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMut.mutate({ file, mode: "merge" }, {
      onSettled: () => {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
    });
  };

  const handleClearData = () => {
    clearMut.mutate(undefined, {
      onSuccess: () => setShowClearConfirm(false),
    });
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
          <Download className="w-4 h-4" />
          {downloadMut.isPending ? "Exporting..." : "Export Data"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
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
    </div>
  );
}
