"use client";

import { useState, useCallback } from "react";
import { useToast } from "@intake/ui/use-toast";

interface DeleteMutation {
  mutateAsync: (id: string) => Promise<unknown>;
}

/**
 * Shared hook for delete-with-loading-spinner + toast pattern.
 * Used by every card component that has a "Recent" entries list.
 *
 * `options.undoToast`: pass true when the delete mutation already surfaces its
 * own undo toast (the useUndoDeleteMutation domains: intake, eating, urination,
 * defecation). In that case we must NOT fire a second "Entry deleted" toast —
 * TOAST_LIMIT is 1, so it would instantly replace the undo toast and the Undo
 * button would never be clickable. Domains without an undo toast (weight, blood
 * pressure) leave this off and get the plain confirmation toast.
 */
export function useDeleteWithToast(
  deleteMutation: DeleteMutation,
  successMessage: string,
  options?: { undoToast?: boolean }
) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();
  const undoToast = options?.undoToast ?? false;

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteMutation.mutateAsync(id);
        if (!undoToast) {
          toast({
            title: "Entry deleted",
            description: successMessage,
          });
        }
      } catch {
        toast({
          title: "Error",
          description: "Could not delete the entry",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [deleteMutation, toast, successMessage, undoToast]
  );

  return { deletingId, handleDelete };
}
