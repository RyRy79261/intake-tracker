"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface DeleteMutation {
  mutateAsync: (id: string) => Promise<unknown>;
}

/**
 * Shared hook for delete-with-loading-spinner + toast pattern.
 * Used by every card component that has a "Recent" entries list.
 */
export function useDeleteWithToast(
  deleteMutation: DeleteMutation,
  successMessage: string
) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          title: "Entry deleted",
          description: successMessage,
        });
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
    [deleteMutation, toast, successMessage]
  );

  return { deletingId, handleDelete };
}
