"use client";

import { useMutation } from "@tanstack/react-query";
import { downloadBackup, importBackup, type ImportResult } from "@/lib/backup-service";
import { clearAllData } from "@/lib/intake-service";
import { unwrap } from "@/lib/service-result";
import { useToast } from "@/hooks/use-toast";

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
      const total =
        data.intakeImported +
        data.weightImported +
        data.bpImported +
        data.eatingImported +
        data.urinationImported +
        data.defecationImported;
      toast({
        title: "Import successful",
        description: `Imported ${total} records (${data.skipped} skipped)`,
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

export function useClearAllData() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => unwrap(await clearAllData()),
    onSuccess: () => {
      toast({
        title: "Data cleared",
        description: "All intake records have been deleted",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to clear data: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}
