import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEntry, updateEntry as updateEntryApi, deleteEntry as deleteEntryApi } from "../api/client";
import type { Entry, UpdateEntryInput } from "../types/entry";

export function useEntry(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<Entry, Error>({
    queryKey: ["entry", id],
    queryFn: () => {
      if (!id) throw new Error("Entry ID is required");
      return fetchEntry(id);
    },
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: UpdateEntryInput) => {
      if (!id) throw new Error("Entry ID is required");
      return updateEntryApi(id, updates);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["entry", id], updated);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error("Entry ID is required");
      return deleteEntryApi(id);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["entry", id] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  return {
    entry: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateEntry: updateMutation.mutate,
    updateEntryAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isUpdateSuccess: updateMutation.isSuccess,
    deleteEntry: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
