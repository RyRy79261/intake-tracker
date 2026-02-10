"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Trash2 } from "lucide-react";
import { clearAllData } from "@/lib/intake-service";
import { downloadBackup, importBackup } from "@/lib/backup-service";
import { useToast } from "@/hooks/use-toast";

export function DataManagementSection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadBackup();
      toast({
        title: "Export successful",
        description: "Your data has been downloaded",
        variant: "success",
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Could not export data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importBackup(file, "merge");
      if (result.success) {
        const total =
          result.intakeImported +
          result.weightImported +
          result.bpImported +
          result.eatingImported +
          result.urinationImported;
        toast({
          title: "Import successful",
          description: `Imported ${total} records (${result.skipped} skipped)`,
          variant: "success",
        });
      } else {
        throw new Error(result.errors.join(", ") || "Import failed");
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description:
          error instanceof Error ? error.message : "Could not import data",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClearData = async () => {
    try {
      await clearAllData();
      toast({
        title: "Data cleared",
        description: "All intake records have been deleted",
        variant: "success",
      });
      setShowClearConfirm(false);
    } catch {
      toast({
        title: "Error",
        description: "Could not clear data",
        variant: "destructive",
      });
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
          disabled={isExporting}
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Exporting..." : "Export Data"}
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
          disabled={isImporting}
        >
          <Upload className="w-4 h-4" />
          {isImporting ? "Importing..." : "Import Data"}
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
