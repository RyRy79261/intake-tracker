"use client";

import { useMutation } from "@tanstack/react-query";
import {
  deleteRecordsInRange,
  type DeleteRange,
} from "@/lib/data-deletion-service";
import { queryClient } from "@/lib/query-client";
import { unwrap } from "@/lib/service-result";
import { useToast } from "@/hooks/use-toast";

export type { DeleteRange };

/**
 * Mutation for time-framed deletion of logged records. Invalidates all queries
 * on success so any open data view reflects the removal.
 */
export function useDeleteDataInRange() {
  const { toast } = useToast();
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
