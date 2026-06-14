"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteRecordsInRange,
  olderThanDays,
  ALL_TIME,
  type DeleteRange,
} from "@/lib/data-deletion-service";
import { unwrap } from "@intake/core/service";
import { useToast } from "@intake/ui/use-toast";

// Re-exported so components can build deletion presets without importing the
// service layer directly (no-restricted-imports).
export { olderThanDays, ALL_TIME };
export type { DeleteRange };

/**
 * Mutation for time-framed deletion of logged records. Invalidates all queries
 * on success so any open data view reflects the removal.
 */
export function useDeleteDataInRange() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (range: DeleteRange) =>
      unwrap(await deleteRecordsInRange(range)),
    onSuccess: (count: number) => {
      queryClient.invalidateQueries();
      toast({
        title: "Data deleted",
        description: `${count.toLocaleString()} record${count === 1 ? "" : "s"} deleted.`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to delete data: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}
