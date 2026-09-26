"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrap } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { toast } from "@intake/ui/use-toast";
import { showUndoToast } from "@/components/medications/undo-toast";

/**
 * Run an undo and tell the user when it failed. The services return `err(...)`
 * rather than throwing, so an ignored result left the record deleted while the
 * user believed it was restored.
 */
export async function runUndo(
  undo: () => Promise<ServiceResult<unknown>>,
): Promise<void> {
  let failed: boolean;
  try {
    failed = !(await undo()).success;
  } catch {
    failed = true;
  }
  if (failed) {
    toast({
      title: "Could not restore",
      description: "The deleted entry could not be brought back",
      variant: "destructive",
    });
  }
}

/**
 * Shared delete mutation for the record domains: deletes by id, then shows the
 * undo toast (~5s window per D-08) whose action reverses the soft-delete.
 *
 * Collapses the byte-identical useDelete{Intake,Urination,Defecation,Eating}
 * bodies — each only differed by which service delete/undo pair it called.
 * `undoFn` also receives whatever the delete returned (e.g. a group delete's
 * tombstone stamp).
 */
export function useUndoDeleteMutation<T = void>(
  deleteFn: (id: string) => Promise<ServiceResult<T>>,
  undoFn: (id: string, deleted: T) => Promise<ServiceResult<unknown>>,
  title = "Record deleted",
) {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteFn(id)),
    onSuccess: (data, id) => {
      showUndoToast({ title, onUndo: () => runUndo(() => undoFn(id, data)) });
    },
  });
}
