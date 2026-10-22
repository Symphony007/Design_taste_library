import { useQuery } from "@tanstack/react-query";
import { fetchEntries } from "../api/client";
import type { Entry } from "../types/entry";

export interface UseEntriesFilters {
  category?: string;
  tag?: string;
}

export function useEntries(filters?: UseEntriesFilters) {
  const query = useQuery<Entry[], Error>({
    queryKey: ["entries", filters],
    queryFn: () => fetchEntries(filters),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
