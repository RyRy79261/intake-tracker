"use client";

import { useMutation } from "@tanstack/react-query";
import { downloadBackup, importBackup, resolveConflicts, type ImportResult, type ConflictRecord } from "@/lib/backup-service";
import { unwrap } from "@intake/core/service";
import { useToast } from "@intake/ui/use-toast";

export type { ImportResult, ConflictRecord };

export function useDownloadBackup() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => unwrap(await downloadBackup()),
    onSuccess: () => {
      toast({
        title: "Export successful",
        description: "Your data has been downloaded",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: `Failed to export data: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useUploadBackup() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ file, mode = "merge" }: { file: File; mode?: "merge" | "replace" }) => {
      const result = unwrap(await importBackup(file, mode));
      return result;
    },
    onSuccess: (data: ImportResult) => {
      toast({
        title: "Import successful",
        description: `Imported ${data.totalImported} records (${data.skipped} skipped${data.conflicts.length > 0 ? `, ${data.conflicts.length} conflicts` : ""})`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: `Failed to import data: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useResolveConflicts() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (resolutions: Array<{ table: string; id: string; useBackup: boolean; backupRecord: Record<string, unknown> }>) => {
      return unwrap(await resolveConflicts(resolutions));
    },
    onSuccess: (data) => {
      toast({
        title: "Conflicts resolved",
        description: `${data.resolved} records updated`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Resolution failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
