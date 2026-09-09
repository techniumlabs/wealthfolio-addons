// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { useSwingDashboard } from "./use-swing-dashboard";

vi.mock("./use-swing-preferences", () => ({
  useSwingPreferences: () => ({
    preferences: {
      selectedActivityIds: ["open", "close"],
      includeSwingTag: false,
      lotMatchingMethod: "FIFO",
      includeFees: true,
      includeDividends: false,
    },
  }),
}));
vi.mock("./use-currency-conversion", () => ({
  useCurrencyConversion: () => ({ baseCurrency: "USD", exchangeRates: [] }),
}));
vi.mock("./use-swing-activities", () => ({
  useSwingActivities: () => useQuery({ queryKey: ["test-activities"], queryFn: async () => [] }),
}));
vi.mock("./use-holdings", () => ({
  useHoldings: () => useQuery({ queryKey: ["test-holdings"], queryFn: async () => [] }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: Root | undefined;
let container: HTMLDivElement;
let client: QueryClient;
let result: ReturnType<typeof useSwingDashboard>;
const open = {
  id: "open",
  accountId: "account",
  assetId: "asset",
  assetSymbol: "custom",
  activityType: "BUY",
  subtype: "POSITION_OPEN",
  quantity: "1",
  unitPrice: "2",
  fee: "0",
  date: "2026-06-01",
  currency: "USD",
  accountName: "Account",
};
const close = {
  ...open,
  id: "close",
  activityType: "SELL",
  subtype: "POSITION_CLOSE",
  unitPrice: "3",
  date: "2026-06-02",
};
const holding = { accountId: "account", instrument: { id: "asset" }, price: 3 };
const profile = (multiplier: number) => ({
  id: "asset",
  instrumentType: "OPTION",
  metadata: { contractMultiplier: multiplier },
});
function Probe({ ctx }: { ctx: AddonContext }) {
  result = useSwingDashboard(ctx, "ALL");
  return null;
}
async function mount(
  getProfile: ReturnType<typeof vi.fn>,
  activities = [open],
  holdings = [holding],
) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["test-activities"], activities);
  client.setQueryData(["test-holdings"], holdings);
  const ctx = { api: { assets: { getProfile } } } as unknown as AddonContext;
  await act(async () => {
    container = document.createElement("div");
    renderer = createRoot(container);
    renderer.render(createElement(QueryClientProvider, { client }, createElement(Probe, { ctx })));
  });
  return ctx;
}
async function check(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assertion();
  });
}
beforeEach(() => {
  notifyManager.setNotifyFunction((callback) => act(callback));
});
afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  client?.clear();
  notifyManager.setNotifyFunction((callback) => callback());
});

it("updates valuation when a quote or cached asset multiplier changes", async () => {
  await mount(vi.fn().mockResolvedValue(profile(10)));
  await check(() => expect(result.data?.metrics.totalUnrealizedPL).toBe(10));
  await act(async () => {
    client.setQueryData(["test-holdings"], [{ ...holding, price: 4 }]);
  });
  await check(() => expect(result.data?.metrics.totalUnrealizedPL).toBe(20));
  await act(async () => {
    client.setQueryData(["swing-asset-profile", "asset"], profile(25));
  });
  await check(() => expect(result.data?.metrics.totalUnrealizedPL).toBe(50));
});

it("loads fully closed assets and recovers from profile failure through Retry", async () => {
  const getProfile = vi.fn().mockRejectedValue(new Error("Asset unavailable"));
  await mount(getProfile, [open, close], []);
  await check(() => {
    expect(result.error?.message).toBe("Asset unavailable");
    expect(result.isPending || result.isLoading).toBe(false);
  });
  getProfile.mockResolvedValue(profile(10));
  await act(async () => {
    await result.refetch();
  });
  await check(() => {
    expect(result.error).toBeFalsy();
    expect(result.data?.metrics.totalRealizedPL).toBe(10);
  });
  expect(getProfile).toHaveBeenCalledTimes(2);
});

it("refreshes a host-edited multiplier on dashboard remount despite fresh cache", async () => {
  const getProfile = vi.fn().mockResolvedValue(profile(10));
  const ctx = await mount(getProfile, [open, close], []);
  await check(() => expect(result.data?.metrics.totalRealizedPL).toBe(10));
  await act(async () => {
    renderer?.unmount();
  });
  getProfile.mockResolvedValue(profile(25));
  await act(async () => {
    container = document.createElement("div");
    renderer = createRoot(container);
    renderer.render(createElement(QueryClientProvider, { client }, createElement(Probe, { ctx })));
  });
  await check(() => expect(result.data?.metrics.totalRealizedPL).toBe(25));
  expect(getProfile).toHaveBeenCalledTimes(2);
});
