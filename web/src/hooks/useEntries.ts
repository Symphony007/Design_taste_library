import { useQuery } from "@tanstack/react-query";
import { fetchEntries } from "../api/client";
import type { Entry } from "../types/entry";

export function useEntries() {
  const query = useQuery<Entry[], Error>({
    queryKey: ["entries"],
    queryFn: () => fetchEntries(),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
