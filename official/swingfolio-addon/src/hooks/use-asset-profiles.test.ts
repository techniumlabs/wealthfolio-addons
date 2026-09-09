import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { assetProfileQuery } from "./use-asset-profiles";

it("deduplicates profile requests and refreshes changed multipliers", async () => {
  const getProfile = vi
    .fn()
    .mockResolvedValue({ id: "closed-asset", metadata: { contractMultiplier: 10 } });
  const ctx = { api: { assets: { getProfile } } } as unknown as AddonContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = assetProfileQuery(ctx, "closed-asset");
  const [first, second] = await Promise.all([
    client.fetchQuery(options),
    client.fetchQuery(options),
  ]);
  expect(first).toEqual(second);
  expect(getProfile).toHaveBeenCalledTimes(1);
  getProfile.mockResolvedValue({ id: "closed-asset", metadata: { contractMultiplier: 25 } });
  await client.invalidateQueries({ queryKey: options.queryKey });
  expect((await client.fetchQuery(options)).metadata?.contractMultiplier).toBe(25);
  client.clear();
});

it("propagates profile failures and permits retry without inventing a default", async () => {
  const getProfile = vi.fn().mockRejectedValue(new Error("Asset unavailable"));
  const ctx = { api: { assets: { getProfile } } } as unknown as AddonContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = assetProfileQuery(ctx, "closed-asset");
  await expect(client.fetchQuery(options)).rejects.toThrow("Asset unavailable");
  getProfile.mockResolvedValue({ id: "closed-asset", metadata: { contractMultiplier: 10 } });
  expect((await client.fetchQuery(options)).metadata?.contractMultiplier).toBe(10);
  client.clear();
});
