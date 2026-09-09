import { describe, expect, it } from "vitest";
import type { ActivityDetails, Asset, Holding } from "@wealthfolio/addon-sdk";
import { TradeMatcher } from "./trade-matcher";
import { resolveContractMultiplier } from "./asset-multiplier";
import { updateOpenPositionsWithMarketPrices } from "./position-valuation";

const option = {
  underlyingAssetId: "underlying",
  expiration: "2026-09-18",
  right: "CALL",
  strike: "200",
  multiplier: "10",
};
function asset(id = "option", metadata: Record<string, unknown> = { option }): Asset {
  return { id, instrumentType: "OPTION", metadata } as Asset;
}
function activity(
  id: string,
  activityType: string,
  quantity: number,
  unitPrice: number,
  extra: Partial<ActivityDetails> = {},
): ActivityDetails {
  return {
    id,
    accountId: "account",
    assetId: "option",
    assetSymbol: "custom-label",
    accountName: "Account",
    accountCurrency: "USD",
    currency: "USD",
    activityType,
    quantity: String(quantity),
    unitPrice: String(unitPrice),
    fee: "0",
    amount: "0",
    date: new Date(`2026-06-${id.padStart(2, "0")}T12:00:00Z`),
    ...extra,
  } as ActivityDetails;
}
const methods = ["FIFO", "LIFO", "AVERAGE"] as const;
function matcher(lotMethod: (typeof methods)[number], includeFees = true) {
  return new TradeMatcher({ lotMethod, includeFees, assets: new Map([["option", asset()]]) });
}

describe("asset multiplier parity", () => {
  it.each([
    [undefined, "OPTION", 100],
    [undefined, "EQUITY", 1],
    [{ option }, "OPTION", 10],
    [{ option, contractMultiplier: 50 }, "OPTION", 10],
    [{ option: { multiplier: 10 }, contractMultiplier: "50" }, "OPTION", 50],
    [{ contractMultiplier: "25" }, "OPTION", 25],
    [{ contractMultiplier: 0 }, "OPTION", 100],
    [{ contractMultiplier: "invalid" }, "OPTION", 100],
    [{ contractMultiplier: "0.01" }, "BOND", 0.01],
  ])("resolves %j for %s", (metadata, instrumentType, expected) => {
    expect(resolveContractMultiplier(metadata, instrumentType as string)).toBe(expected);
  });
});

for (const method of methods) {
  describe(method, () => {
    for (const short of [false, true]) {
      for (const includeFees of [false, true]) {
        it(`values ${short ? "short" : "long"} partial close with fees=${includeFees}`, () => {
          const open = activity("1", short ? "SELL" : "BUY", 3, 2, {
            subtype: "POSITION_OPEN",
            fee: "3",
          });
          const close = activity("2", short ? "BUY" : "SELL", 2, 1, {
            subtype: "POSITION_CLOSE",
            fee: "2",
          });
          const result = matcher(method, includeFees).matchTrades([close, open]);
          expect(result.closedTrades).toHaveLength(1);
          expect(result.closedTrades[0].realizedPL).toBe(
            (short ? 20 : -20) - (includeFees ? 4 : 0),
          );
          expect(result.closedTrades[0].contractMultiplier).toBe(10);
          expect(result.openPositions[0].quantity).toBe(1);
          const holding = {
            accountId: "account",
            instrument: { id: "option", symbol: "different-label" },
            price: 3,
          } as Holding;
          const updated = updateOpenPositionsWithMarketPrices(result.openPositions, [holding]);
          expect(updated[0].marketValue).toBe(30);
          expect(updated[0].unrealizedPL).toBe(short ? -10 : 10);
        });
      }
    }
    it("keeps accounts and asset IDs separate even with identical symbols", () => {
      const m = new TradeMatcher({
        lotMethod: method,
        assets: new Map([
          ["option", asset()],
          ["other", asset("other")],
        ]),
      });
      const result = m.matchTrades([
        activity("1", "BUY", 1, 2, { subtype: "POSITION_OPEN" }),
        activity("2", "SELL", 1, 4, { subtype: "POSITION_OPEN", accountId: "other-account" }),
        activity("3", "BUY", 1, 1, { subtype: "POSITION_CLOSE", accountId: "other-account" }),
        activity("4", "SELL", 1, 3, { subtype: "POSITION_CLOSE", assetId: "other" }),
      ]);
      expect(result.closedTrades).toHaveLength(1);
      expect(result.closedTrades[0].accountId).toBe("other-account");
      expect(result.closedTrades[0].realizedPL).toBe(30);
      expect(result.openPositions).toHaveLength(1);
      expect(result.openPositions[0].accountId).toBe("account");
      expect(result.unmatchedSells).toHaveLength(1);
    });
    it.each([false, true])("infers reversal with no subtype, short=%s", (short) => {
      const result = matcher(method).matchTrades([
        activity("1", short ? "SELL" : "BUY", 2, 2, { fee: "2", subtype: null }),
        activity("2", short ? "BUY" : "SELL", 3, 3, { fee: "3", subtype: null }),
        activity("3", short ? "SELL" : "BUY", 1, 1, { fee: "1", subtype: null }),
      ]);
      expect(result.closedTrades).toHaveLength(2);
      expect(result.openPositions).toHaveLength(0);
      expect(result.unmatchedBuys).toHaveLength(0);
      expect(result.unmatchedSells).toHaveLength(0);
      expect(result.closedTrades.reduce((sum, t) => sum + t.totalFees, 0)).toBe(6);
      expect(result.closedTrades.reduce((sum, t) => sum + t.realizedPL, 0)).toBe(
        (short ? -40 : 40) - 6,
      );
    });
    it.each([false, true])(
      "nets explicit opens against existing opposite inventory, short=%s",
      (short) => {
        const result = matcher(method).matchTrades([
          activity("1", short ? "SELL" : "BUY", 1, 2, { subtype: "POSITION_OPEN" }),
          activity("2", short ? "BUY" : "SELL", 2, 3, { subtype: "POSITION_OPEN", fee: "2" }),
        ]);
        expect(result.closedTrades).toHaveLength(1);
        expect(result.closedTrades[0].realizedPL).toBe((short ? -10 : 10) - 1);
        expect(result.openPositions).toHaveLength(1);
        expect(result.openPositions[0].quantity).toBe(1);
        expect(result.openPositions[0].direction).toBe(short ? "LONG" : "SHORT");
      },
    );
    it("leaves excess explicit closes unmatched", () => {
      const result = matcher(method).matchTrades([
        activity("1", "SELL", 1, 2, { subtype: "POSITION_OPEN" }),
        activity("2", "BUY", 3, 1, { subtype: "POSITION_CLOSE" }),
      ]);
      expect(result.closedTrades[0].quantity).toBe(1);
      expect(result.openPositions).toHaveLength(0);
      expect(Number(result.unmatchedBuys[0].quantity)).toBe(2);
    });
    it("selects the expected lot cost", () => {
      const result = matcher(method, false).matchTrades([
        activity("1", "BUY", 1, 2),
        activity("2", "BUY", 1, 4),
        activity("3", "SELL", 1, 5),
      ]);
      expect(result.closedTrades[0].realizedPL).toBe(
        method === "FIFO" ? 30 : method === "LIFO" ? 10 : 20,
      );
    });
    it.each([false, true])("adjusts inferred option inventory after a split, short=%s", (short) => {
      const result = matcher(method).matchTrades([
        activity("1", short ? "SELL" : "BUY", 1, 2),
        activity("2", "SPLIT", 0, 0, { amount: "2" }),
        activity("3", short ? "BUY" : "SELL", 2, 2),
      ]);
      expect(result.closedTrades[0].quantity).toBe(2);
      expect(result.closedTrades[0].realizedPL).toBe(short ? -20 : 20);
      expect(result.openPositions).toHaveLength(0);
    });
    it("retains equity split, fee, and dividend handling", () => {
      const m = new TradeMatcher({
        lotMethod: method,
        assets: new Map([["option", { ...asset(), instrumentType: "EQUITY" }]]),
      });
      const result = m.matchTrades([
        activity("1", "BUY", 2, 10, { fee: "2" }),
        activity("2", "SPLIT", 0, 0, { amount: "2" }),
        activity("3", "DIVIDEND", 0, 0, { amount: "3" }),
        activity("4", "SELL", 4, 6, { fee: "1" }),
      ]);
      expect(result.closedTrades[0].realizedPL).toBe(4);
      expect(result.openPositions).toHaveLength(0);
    });
  });
}

it("uses account and asset identity for quotes", () => {
  const positions = matcher("FIFO").matchTrades([activity("1", "BUY", 1, 2)]).openPositions;
  const holdings = [
    { accountId: "other", instrument: { id: "option" }, price: 100 },
    { accountId: "account", instrument: { id: "other", symbol: "custom-label" }, price: 200 },
    { accountId: "account", instrument: { id: "option" }, price: 3 },
  ] as Holding[];
  expect(updateOpenPositionsWithMarketPrices(positions, holdings)[0].unrealizedPL).toBe(10);
});
