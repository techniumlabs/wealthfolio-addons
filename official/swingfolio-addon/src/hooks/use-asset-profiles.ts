import { useQueries } from "@tanstack/react-query";
import type { AddonContext, Asset } from "@wealthfolio/addon-sdk";

export function assetProfileQuery(ctx: AddonContext, assetId: string) {
  return {
    queryKey: ["swing-asset-profile", assetId],
    queryFn: () => ctx.api.assets.getProfile(assetId),
    staleTime: 2 * 60 * 1000,
    // Asset edits happen in the host, whose query cache is outside the addon.
    refetchOnMount: "always" as const,
  };
}

export function useAssetProfiles(ctx: AddonContext, assetIds: string[]) {
  const ids = [...new Set(assetIds)].sort();
  const queries = useQueries({ queries: ids.map((id) => assetProfileQuery(ctx, id)) });
  return {
    data: queries.every((query) => query.isSuccess)
      ? queries.map((query) => query.data as Asset)
      : undefined,
    error: queries.find((query) => query.error)?.error,
    isPending: queries.some((query) => query.isPending),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
