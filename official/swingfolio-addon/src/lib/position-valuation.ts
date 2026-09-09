import type { Holding } from "@wealthfolio/addon-sdk";
import type { OpenPosition } from "../types";

/**
 * Update open positions with current market prices from holdings
 */
export function updateOpenPositionsWithMarketPrices(
  openPositions: OpenPosition[],
  holdings: Holding[],
): OpenPosition[] {
  return openPositions.map((position) => {
    // Find matching holding by symbol
    const matchingHolding = holdings.find(
      (holding) =>
        holding.accountId === position.accountId && holding.instrument?.id === position.assetId,
    );

    if (matchingHolding?.price != null && matchingHolding.price > 0) {
      // Get current price and ensure it's in the same currency as the position
      let currentPrice = matchingHolding.price;

      // If holding has different currency than position, we need to convert
      if (
        matchingHolding.localCurrency &&
        matchingHolding.localCurrency !== position.currency &&
        matchingHolding.fxRate
      ) {
        // Convert holding price from local currency to position currency
        if (matchingHolding.baseCurrency === position.currency) {
          // Holding is in local currency, position is in base currency
          currentPrice = matchingHolding.price * matchingHolding.fxRate;
        } else if (matchingHolding.localCurrency === position.currency) {
          // Already in correct currency
          currentPrice = matchingHolding.price;
        }
        // Note: More complex currency conversions would need additional FX rate lookups
      }

      const contractMultiplier = position.contractMultiplier;
      const marketValue = currentPrice * position.quantity * contractMultiplier;
      const costBasis = position.averageCost * position.quantity * contractMultiplier;
      const isShortOption = position.direction === "SHORT";
      // Include dividends in unrealized P/L calculation to match TradeMatcher
      const unrealizedPL = isShortOption
        ? costBasis - marketValue + (position.totalDividends || 0)
        : marketValue - costBasis + (position.totalDividends || 0);
      const unrealizedReturnPercent = costBasis > 0 ? unrealizedPL / costBasis : 0;

      return {
        ...position,
        currentPrice,
        marketValue,
        unrealizedPL,
        unrealizedReturnPercent,
      };
    }

    return position;
  });
}
