"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrap, type ServiceResult } from "@/lib/service-result";
import { showUndoToast } from "@/components/medications/undo-toast";

/**
 * Shared delete mutation for the record domains: deletes by id, then shows the
 * undo toast (~5s window per D-08) whose action reverses the soft-delete.
 *
 * Collapses the byte-identical useDelete{Intake,Urination,Defecation,Eating}
 * bodies — each only differed by which service delete/undo pair it called.
 */
export function useUndoDeleteMutation(
  deleteFn: (id: string) => Promise<ServiceResult<void>>,
  undoFn: (id: string) => Promise<ServiceResult<void>>,
  title = "Record deleted",
) {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteFn(id)),
    onSuccess: (_data, id) => {
      showUndoToast({ title, onUndo: () => { undoFn(id); } });
    },
  });
}
