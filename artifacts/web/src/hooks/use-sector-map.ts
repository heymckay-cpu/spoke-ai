import { useMemo } from "react";
import { useGetSectors, getGetSectorsQueryKey } from "@workspace/api-client-react";
import type { SectorMap } from "@workspace/portfolio";

/**
 * Fetch a ticker → sector map for the given tickers from the API server's
 * provider-resolved cache. Empty input skips the request entirely. The
 * returned `sectorMap` can be passed to the concentration helpers in
 * `@workspace/portfolio` so they classify any ticker the user trades —
 * not just the curated list in `@workspace/data/sectors`.
 */
export function useSectorMap(tickers: readonly string[]): SectorMap | undefined {
  // Stabilize the request so React Query's cache key doesn't churn on
  // every render: dedupe + sort uppercased tickers.
  const normalized = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickers) {
      const u = t.trim().toUpperCase();
      if (u) set.add(u);
    }
    return Array.from(set).sort();
  }, [tickers]);

  const csv = normalized.join(",");
  const query = useGetSectors(
    { tickers: csv },
    {
      query: {
        queryKey: getGetSectorsQueryKey({ tickers: csv }),
        enabled: csv.length > 0,
        staleTime: 60 * 60 * 1000,
      },
    },
  );

  return useMemo(() => {
    if (!query.data?.sectors) return undefined;
    return query.data.sectors as SectorMap;
  }, [query.data]);
}
