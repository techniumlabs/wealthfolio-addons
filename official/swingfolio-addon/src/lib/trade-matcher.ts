import type { ActivityDetails, Asset } from "@wealthfolio/addon-sdk";
import { resolveContractMultiplier } from "./asset-multiplier";
import { differenceInDays } from "date-fns";
import type { ClosedTrade, OpenPosition, TradeMatchResult } from "../types";

/** ActivityDetails with numeric fields parsed from string | null */
type ParsedActivity = Omit<ActivityDetails, "quantity" | "unitPrice" | "fee" | "amount"> & {
  quantity: number;
  unitPrice: number;
  fee: number;
  amount: number;
  instrumentType?: string;
};

interface Lot {
  activity: ParsedActivity;
  remainingQuantity: number;
  originalQuantity: number;
  dividends: ParsedActivity[];
}

interface AverageLot {
  symbol: string;
  totalQuantity: number;
  totalCostBasis: number;
  averagePrice: number;
  activities: ParsedActivity[];
  remainingQuantity: number;
  dividends: ParsedActivity[];
}

export interface TradeMatcherOptions {
  assets?: ReadonlyMap<string, Asset>;
  lotMethod?: "FIFO" | "LIFO" | "AVERAGE";
  includeFees?: boolean;
  includeDividends?: boolean;
}

/**
 * TradeMatcher class for matching buy and sell activities to compute closed trades and open positions
 */
export class TradeMatcher {
  private lotMethod: "FIFO" | "LIFO" | "AVERAGE";
  private includeFees: boolean;
  private includeDividends: boolean;
  private assets: ReadonlyMap<string, Asset>;

  constructor(options: TradeMatcherOptions = {}) {
    this.assets = options.assets ?? new Map();
    this.lotMethod = options.lotMethod || "FIFO";
    this.includeFees = options.includeFees !== false; // Default to true
    this.includeDividends = options.includeDividends !== false; // Default to true
  }

  /**
   * Read instrument type from activity payload.
   */
  private getInstrumentType(activity: ParsedActivity): string | undefined {
    return this.assets.get(activity.assetId)?.instrumentType ?? activity.instrumentType;
  }

  /**
   * Resolve valuation from the asset, never the display symbol or activity metadata.
   */
  private getContractMultiplier(activity: ParsedActivity): number {
    return resolveContractMultiplier(
      this.assets.get(activity.assetId)?.metadata,
      this.getInstrumentType(activity),
    );
  }

  /**
   * OPTION short open: SELL + POSITION_OPEN.
   */
  private isOptionShortOpen(activity: ParsedActivity): boolean {
    const instrumentType = this.getInstrumentType(activity);
    return (
      instrumentType === "OPTION" &&
      activity.activityType === "SELL" &&
      activity.subtype === "POSITION_OPEN"
    );
  }

  /**
   * OPTION short close: BUY + POSITION_CLOSE.
   */
  private isOptionShortClose(activity: ParsedActivity): boolean {
    const instrumentType = this.getInstrumentType(activity);
    return (
      instrumentType === "OPTION" &&
      activity.activityType === "BUY" &&
      activity.subtype === "POSITION_CLOSE"
    );
  }

  /**
   * Determine whether an activity opens a position.
   */
  private isOpeningActivity(activity: ParsedActivity): boolean {
    const instrumentType = this.getInstrumentType(activity);

    if (instrumentType === "OPTION") {
      return activity.subtype === "POSITION_OPEN";
    }

    return activity.activityType === "BUY";
  }

  /**
   * Determine whether an activity closes a position.
   */
  private isClosingActivity(activity: ParsedActivity): boolean {
    const instrumentType = this.getInstrumentType(activity);

    if (instrumentType === "OPTION") {
      return activity.subtype === "POSITION_CLOSE";
    }

    return activity.activityType === "SELL";
  }

  /**
   * Whether an opening activity represents a short position.
   */
  private isShortOpeningActivity(activity: ParsedActivity): boolean {
    return this.isOptionShortOpen(activity);
  }

  /**
   * Whether a closing activity is intended to close a short position.
   */
  private isShortClosingActivity(activity: ParsedActivity): boolean {
    return this.isOptionShortClose(activity);
  }

  /**
   * Track unmatched closing activity in the correct bucket.
   */
  private pushUnmatchedClosing(
    activity: ParsedActivity,
    quantity: number,
    unmatchedBuys: ActivityDetails[],
    unmatchedSells: ActivityDetails[],
  ): void {
    const unmatched = {
      ...activity,
      quantity,
    } as unknown as ActivityDetails;

    if (activity.activityType === "BUY") {
      unmatchedBuys.push(unmatched);
    } else {
      unmatchedSells.push(unmatched);
    }
  }

  /**
   * Match trades from a list of activities
   */
  matchTrades(activities: ActivityDetails[]): TradeMatchResult {
    // Ensure all numeric fields are properly parsed
    const parsedActivities = this.parseActivities(activities);

    // Separate trading activities from dividends and splits
    const tradingActivities = parsedActivities.filter(
      (a) => a.activityType === "BUY" || a.activityType === "SELL" || a.activityType === "SPLIT",
    );
    const dividendActivities = parsedActivities.filter((a) => a.activityType === "DIVIDEND");

    // Group activities by account and asset identity
    const bySymbol = this.groupByAccountAsset(tradingActivities);
    const dividendsBySymbol = this.groupByAccountAsset(dividendActivities);

    const closedTrades: ClosedTrade[] = [];
    const openPositions: OpenPosition[] = [];
    const unmatchedBuys: ActivityDetails[] = [];
    const unmatchedSells: ActivityDetails[] = [];

    // Process each symbol separately
    for (const [key, symbolActivities] of Object.entries(bySymbol)) {
      const symbol = symbolActivities[0].assetSymbol;
      const symbolDividends = dividendsBySymbol[key] || [];
      const result = this.matchSymbolTrades(symbol, symbolActivities, symbolDividends);

      closedTrades.push(...result.closedTrades);
      openPositions.push(...result.openPositions);
      unmatchedBuys.push(...result.unmatchedBuys);
      unmatchedSells.push(...result.unmatchedSells);
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    };
  }

  /**
   * Parse activities to ensure numeric fields are numbers
   */
  private parseActivities(activities: ActivityDetails[]): ParsedActivity[] {
    return activities.map(
      (a) =>
        ({
          ...a,
          quantity: this.parseNumber(a.quantity),
          unitPrice: this.parseNumber(a.unitPrice),
          fee: this.parseNumber(a.fee),
          amount: this.parseNumber(a.amount),
        }) as ParsedActivity,
    );
  }

  /**
   * Safely parse a string | number | null value to number.
   */
  private parseNumber(value: string | number | null | undefined): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseFloat(value) || 0;
    return 0;
  }

  /**
   * Group activities by account and asset identity
   */
  private groupByAccountAsset(activities: ParsedActivity[]): Record<string, ParsedActivity[]> {
    return activities.reduce(
      (acc, activity) => {
        const key = JSON.stringify([activity.accountId, activity.assetId]);
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(activity);
        return acc;
      },
      {} as Record<string, ParsedActivity[]>,
    );
  }

  /**
   * Match trades for a specific symbol
   */
  private matchSymbolTrades(
    symbol: string,
    activities: ParsedActivity[],
    dividends: ParsedActivity[] = [],
  ): TradeMatchResult {
    // Sort activities chronologically
    const sortedActivities = [...activities].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const normalized = this.normalizeOptionActivities(sortedActivities);
    // Each cost pool contains one direction; equity behavior is unchanged.
    const result: TradeMatchResult = {
      closedTrades: [],
      openPositions: [],
      unmatchedBuys: [],
      unmatchedSells: [],
    };
    for (const short of [false, true]) {
      const directional = normalized.filter((activity) => {
        if (activity.activityType === "SPLIT") return true;
        const isShort = this.isOpeningActivity(activity)
          ? this.isShortOpeningActivity(activity)
          : this.isShortClosingActivity(activity);
        return isShort === short;
      });
      const matched =
        this.lotMethod === "AVERAGE"
          ? this.matchSymbolTradesAverage(symbol, directional, dividends)
          : this.matchSymbolTradesSpecific(symbol, directional, dividends);
      result.closedTrades.push(...matched.closedTrades);
      result.openPositions.push(...matched.openPositions);
      result.unmatchedBuys.push(...matched.unmatchedBuys);
      result.unmatchedSells.push(...matched.unmatchedSells);
    }
    return result;
  }

  /** Like the host, option trades consume opposite inventory before opening a remainder. */
  private normalizeOptionActivities(activities: ParsedActivity[]): ParsedActivity[] {
    const inventory = { BUY: 0, SELL: 0 };
    const result: ParsedActivity[] = [];
    for (const activity of activities) {
      if (activity.activityType === "SPLIT" && activity.amount > 0) {
        inventory.BUY *= activity.amount;
        inventory.SELL *= activity.amount;
      }
      if (
        this.getInstrumentType(activity) !== "OPTION" ||
        (activity.activityType !== "BUY" && activity.activityType !== "SELL")
      ) {
        result.push(activity);
        continue;
      }
      const side = activity.activityType;
      const opposite = side === "BUY" ? "SELL" : "BUY";
      if (activity.subtype === "POSITION_CLOSE") {
        inventory[opposite] = Math.max(0, inventory[opposite] - activity.quantity);
        result.push(activity);
      } else {
        const closingQuantity = Math.min(inventory[opposite], activity.quantity);
        inventory[opposite] -= closingQuantity;
        const openingQuantity = activity.quantity - closingQuantity;
        inventory[side] += openingQuantity;
        for (const [subtype, quantity] of [
          ["POSITION_CLOSE", closingQuantity],
          ["POSITION_OPEN", openingQuantity],
        ] as const) {
          if (quantity > 0) {
            result.push({
              ...activity,
              subtype,
              quantity,
              fee: (activity.fee * quantity) / activity.quantity,
              amount: (activity.amount * quantity) / activity.quantity,
            });
          }
        }
      }
    }
    return result;
  }

  /**
   * Match trades using average cost method
   */
  private matchSymbolTradesAverage(
    symbol: string,
    activities: ParsedActivity[],
    dividends: ParsedActivity[] = [],
  ): TradeMatchResult {
    const closedTrades: ClosedTrade[] = [];
    const openPositions: OpenPosition[] = [];
    const unmatchedBuys: ActivityDetails[] = [];
    const unmatchedSells: ActivityDetails[] = [];

    let averageLot: AverageLot | null = null;

    for (const activity of activities) {
      if (activity.activityType === "SPLIT") {
        // Split: amount = split ratio (e.g., 10 for 10:1 split)
        const splitRatio = activity.amount;
        if (splitRatio > 0 && averageLot) {
          averageLot.totalQuantity *= splitRatio;
          averageLot.remainingQuantity *= splitRatio;
          averageLot.averagePrice /= splitRatio;
          // totalCostBasis stays the same (same total investment, more shares)
        }
      } else if (this.isOpeningActivity(activity)) {
        // Add to average lot
        if (!averageLot) {
          averageLot = this.createNewAverageLot(activity, symbol);
          // Add dividends that occurred after any buy activity
          if (this.includeDividends) {
            averageLot.dividends = dividends.filter(
              (div) => new Date(div.date) >= new Date(activity.date),
            );
          }
        } else {
          this.updateAverageLot(averageLot, activity);
          // Update dividends to include those after this new buy activity
          if (this.includeDividends) {
            const newDividends = dividends.filter(
              (div) => new Date(div.date) >= new Date(activity.date),
            );
            // Merge with existing dividends, avoiding duplicates
            const existingDivIds = new Set(averageLot.dividends.map((d) => d.id));
            const uniqueNewDivs = newDividends.filter((d) => !existingDivIds.has(d.id));
            averageLot.dividends.push(...uniqueNewDivs);
          }
        }
      } else if (this.isClosingActivity(activity)) {
        // Process sell against average lot
        const averageLotOpeningActivity = averageLot?.activities[0];
        const averageLotIsShort = averageLotOpeningActivity
          ? this.isShortOpeningActivity(averageLotOpeningActivity)
          : false;
        const closingShort = this.isShortClosingActivity(activity);

        if (
          !averageLot ||
          averageLot.remainingQuantity <= 0 ||
          averageLotIsShort !== closingShort
        ) {
          this.pushUnmatchedClosing(activity, activity.quantity, unmatchedBuys, unmatchedSells);
          continue;
        }

        let sellQuantityRemaining = activity.quantity;

        while (sellQuantityRemaining > 0 && averageLot.remainingQuantity > 0) {
          const matchedQuantity = Math.min(sellQuantityRemaining, averageLot.remainingQuantity);

          // Create closed trade using average price
          const closedTrade = this.createClosedTradeAverage(
            averageLot,
            activity,
            matchedQuantity,
            symbol,
          );
          closedTrades.push(closedTrade);

          // Update quantities
          sellQuantityRemaining -= matchedQuantity;
          averageLot.remainingQuantity -= matchedQuantity;
        }

        // Reset average lot if fully sold
        if (averageLot.remainingQuantity <= 0) {
          averageLot = null;
        }

        // Handle remaining unmatched sell quantity
        if (sellQuantityRemaining > 0) {
          this.pushUnmatchedClosing(activity, sellQuantityRemaining, unmatchedBuys, unmatchedSells);
        }
      }
    }

    // Note: Dividends are already allocated during average lot creation/updates

    // Create open position from remaining average lot
    if (averageLot && averageLot.remainingQuantity > 0) {
      const openPosition = this.createOpenPositionAverage(averageLot, symbol);
      openPositions.push(openPosition);
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    };
  }

  /**
   * Create a new average lot
   */
  private createNewAverageLot(activity: ParsedActivity, symbol: string): AverageLot {
    return {
      symbol,
      totalQuantity: activity.quantity,
      totalCostBasis: activity.unitPrice * activity.quantity,
      averagePrice: activity.unitPrice,
      activities: [activity],
      remainingQuantity: activity.quantity,
      dividends: [],
    };
  }

  /**
   * Update existing average lot with new buy activity
   */
  private updateAverageLot(averageLot: AverageLot, activity: ParsedActivity): void {
    const newTotalQuantity = averageLot.remainingQuantity + activity.quantity;
    const newTotalCostBasis =
      averageLot.averagePrice * averageLot.remainingQuantity +
      activity.unitPrice * activity.quantity;

    averageLot.totalQuantity += activity.quantity;
    averageLot.remainingQuantity = newTotalQuantity;
    averageLot.totalCostBasis = newTotalCostBasis;
    averageLot.averagePrice = newTotalCostBasis / newTotalQuantity;
    averageLot.activities.push(activity);
  }

  /**
   * Match trades using FIFO or LIFO method
   */
  private matchSymbolTradesSpecific(
    symbol: string,
    activities: ParsedActivity[],
    dividends: ParsedActivity[] = [],
  ): TradeMatchResult {
    const closedTrades: ClosedTrade[] = [];
    const openPositions: OpenPosition[] = [];
    const unmatchedBuys: ActivityDetails[] = [];
    const unmatchedSells: ActivityDetails[] = [];

    const lots: Lot[] = [];

    for (const activity of activities) {
      if (activity.activityType === "SPLIT") {
        // Split: amount = split ratio (e.g., 10 for 10:1 split)
        const splitRatio = activity.amount;
        if (splitRatio > 0) {
          for (const lot of lots) {
            lot.remainingQuantity *= splitRatio;
            lot.originalQuantity *= splitRatio;
            lot.activity = {
              ...lot.activity,
              quantity: lot.activity.quantity * splitRatio,
              unitPrice: lot.activity.unitPrice / splitRatio,
            };
          }
        }
      } else if (this.isOpeningActivity(activity)) {
        const lot: Lot = {
          activity: activity,
          remainingQuantity: activity.quantity,
          originalQuantity: activity.quantity,
          dividends: [],
        };

        // Allocate dividends that occurred after this buy
        if (this.includeDividends) {
          lot.dividends = dividends.filter((div) => new Date(div.date) >= new Date(activity.date));
        }

        lots.push(lot);
      } else if (this.isClosingActivity(activity)) {
        let sellQuantityRemaining = activity.quantity;

        while (sellQuantityRemaining > 0 && lots.length > 0) {
          const lotIndex = this.lotMethod === "FIFO" ? 0 : lots.length - 1;
          const lot = lots[lotIndex];
          const lotIsShort = this.isShortOpeningActivity(lot.activity);
          const closingShort = this.isShortClosingActivity(activity);

          if (lotIsShort !== closingShort) {
            break;
          }

          const matchedQuantity = Math.min(sellQuantityRemaining, lot.remainingQuantity);

          const closedTrade = this.createClosedTrade(
            lot.activity,
            activity,
            matchedQuantity,
            symbol,
            lot.dividends,
          );
          closedTrades.push(closedTrade);

          sellQuantityRemaining -= matchedQuantity;
          lot.remainingQuantity -= matchedQuantity;

          if (lot.remainingQuantity <= 0) {
            lots.splice(lotIndex, 1);
          }
        }

        if (sellQuantityRemaining > 0) {
          this.pushUnmatchedClosing(activity, sellQuantityRemaining, unmatchedBuys, unmatchedSells);
        }
      }
    }

    // Note: Dividends are already allocated during lot creation

    // Create open positions from remaining lots
    for (const lot of lots) {
      if (lot.remainingQuantity > 0) {
        const openPosition = this.createOpenPosition(lot, symbol);
        openPositions.push(openPosition);
      }
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    };
  }

  /**
   * Create a closed trade from average lot
   */
  private createClosedTradeAverage(
    averageLot: AverageLot,
    closingActivity: ParsedActivity,
    quantity: number,
    symbol: string,
  ): ClosedTrade {
    // Use the earliest buy date for entry date
    const entryDate = new Date(
      Math.min(...averageLot.activities.map((a) => new Date(a.date).getTime())),
    );
    const exitDate = new Date(closingActivity.date);
    const holdingPeriodDays = differenceInDays(exitDate, entryDate);

    // Calculate fees proportionally
    const totalBuyFees = averageLot.activities.reduce((sum, activity) => sum + activity.fee, 0);
    const buyFeeAllocation = this.includeFees
      ? (totalBuyFees * quantity) / averageLot.totalQuantity
      : 0;

    // Sell fees: Calculate proportionally for this sell
    const sellFeeAllocation = this.includeFees
      ? (closingActivity.fee * quantity) / closingActivity.quantity
      : 0;
    const totalFees = buyFeeAllocation + sellFeeAllocation;

    // Calculate dividends for this trade
    const totalDividends = this.calculateTradeDividends(entryDate, exitDate, averageLot.dividends);

    // Calculate P/L using average cost
    const contractMultiplier = this.getContractMultiplier(closingActivity);
    const entryNotional = averageLot.averagePrice * quantity * contractMultiplier;
    const exitNotional = closingActivity.unitPrice * quantity * contractMultiplier;
    const averageLotOpeningActivity =
      averageLot.activities[0] ?? averageLot.activities[averageLot.activities.length - 1];
    const isShort = this.isShortOpeningActivity(averageLotOpeningActivity);
    const realizedPL = isShort
      ? entryNotional - exitNotional - totalFees + totalDividends
      : exitNotional - entryNotional - totalFees + totalDividends;
    const returnPercent = entryNotional > 0 ? realizedPL / entryNotional : 0;

    // Get the most relevant buy activity
    const relevantEntryActivity = averageLot.activities[averageLot.activities.length - 1];
    const openingActivityId = averageLot.activities[0]?.id ?? relevantEntryActivity.id;
    const buyActivityId = isShort ? closingActivity.id : openingActivityId;
    const sellActivityId = isShort ? openingActivityId : closingActivity.id;

    return {
      id: `avg-${openingActivityId}-${closingActivity.id}-${Date.now()}`,
      symbol,
      contractMultiplier,
      direction: isShort ? "SHORT" : "LONG",
      assetId: closingActivity.assetId,
      assetName: closingActivity.assetName || undefined,
      entryDate,
      exitDate,
      quantity,
      entryPrice: averageLot.averagePrice,
      exitPrice: closingActivity.unitPrice,
      totalFees,
      totalDividends,
      realizedPL,
      returnPercent,
      holdingPeriodDays,
      accountId: relevantEntryActivity.accountId,
      accountName: relevantEntryActivity.accountName,
      currency: relevantEntryActivity.currency,
      buyActivityId,
      sellActivityId,
    };
  }

  /**
   * Create an open position from average lot
   */
  private createOpenPositionAverage(averageLot: AverageLot, symbol: string): OpenPosition {
    const openDate = new Date(
      Math.min(...averageLot.activities.map((a) => new Date(a.date).getTime())),
    );
    const daysOpen = differenceInDays(new Date(), openDate);

    // Calculate total dividends for open position
    const totalDividends = this.includeDividends
      ? averageLot.dividends.reduce((sum, div) => sum + div.amount, 0)
      : 0;

    // Initial values (will be updated with real market prices)
    const currentPrice = averageLot.averagePrice;
    const latestActivity = averageLot.activities[averageLot.activities.length - 1];
    const contractMultiplier = this.getContractMultiplier(latestActivity);
    const marketValue = currentPrice * averageLot.remainingQuantity * contractMultiplier;
    const costBasis = averageLot.averagePrice * averageLot.remainingQuantity * contractMultiplier;
    const averageLotOpeningActivity = averageLot.activities[0] ?? latestActivity;
    const isShort = this.isShortOpeningActivity(averageLotOpeningActivity);
    const unrealizedPL = isShort
      ? costBasis - marketValue + totalDividends
      : marketValue - costBasis + totalDividends;
    const unrealizedReturnPercent = costBasis > 0 ? unrealizedPL / costBasis : 0;

    return {
      id: `avg-open-${averageLot.activities[0].id}-${Date.now()}`,
      openingActivityType: averageLotOpeningActivity.activityType,
      openingSubtype: averageLotOpeningActivity.subtype,
      symbol,
      contractMultiplier,
      direction: isShort ? "SHORT" : "LONG",
      assetId: latestActivity.assetId,
      assetName: latestActivity.assetName || undefined,
      quantity: averageLot.remainingQuantity,
      averageCost: averageLot.averagePrice,
      currentPrice,
      marketValue,
      unrealizedPL,
      unrealizedReturnPercent,
      totalDividends,
      daysOpen,
      openDate,
      accountId: latestActivity.accountId,
      accountName: latestActivity.accountName,
      currency: latestActivity.currency,
      activityIds: averageLot.activities.map((a) => a.id),
    };
  }

  /**
   * Create a closed trade from specific lot matching
   */
  private createClosedTrade(
    openingActivity: ParsedActivity,
    closingActivity: ParsedActivity,
    quantity: number,
    symbol: string,
    dividends: ParsedActivity[] = [],
  ): ClosedTrade {
    const entryDate = new Date(openingActivity.date);
    const exitDate = new Date(closingActivity.date);
    const holdingPeriodDays = differenceInDays(exitDate, entryDate);

    // Calculate fees proportionally
    const buyFeeAllocation = this.includeFees
      ? (openingActivity.fee * quantity) / openingActivity.quantity
      : 0;
    const sellFeeAllocation = this.includeFees
      ? (closingActivity.fee * quantity) / closingActivity.quantity
      : 0;
    const totalFees = buyFeeAllocation + sellFeeAllocation;

    // Calculate dividends for this trade
    const totalDividends = this.calculateTradeDividends(entryDate, exitDate, dividends);

    // Calculate P/L
    const contractMultiplier = this.getContractMultiplier(openingActivity);
    const entryNotional = openingActivity.unitPrice * quantity * contractMultiplier;
    const exitNotional = closingActivity.unitPrice * quantity * contractMultiplier;
    const isShort = this.isShortOpeningActivity(openingActivity);
    const realizedPL = isShort
      ? entryNotional - exitNotional - totalFees + totalDividends
      : exitNotional - entryNotional - totalFees + totalDividends;
    const returnPercent = entryNotional > 0 ? realizedPL / entryNotional : 0;

    const buyActivityId = isShort ? closingActivity.id : openingActivity.id;
    const sellActivityId = isShort ? openingActivity.id : closingActivity.id;

    return {
      id: `${openingActivity.id}-${closingActivity.id}-${Date.now()}`,
      symbol,
      contractMultiplier,
      direction: isShort ? "SHORT" : "LONG",
      assetId: openingActivity.assetId,
      assetName: openingActivity.assetName || undefined,
      entryDate,
      exitDate,
      quantity,
      entryPrice: openingActivity.unitPrice,
      exitPrice: closingActivity.unitPrice,
      totalFees,
      totalDividends,
      realizedPL,
      returnPercent,
      holdingPeriodDays,
      accountId: openingActivity.accountId,
      accountName: openingActivity.accountName,
      currency: openingActivity.currency,
      buyActivityId,
      sellActivityId,
    };
  }

  /**
   * Create an open position from a lot
   */
  private createOpenPosition(lot: Lot, symbol: string): OpenPosition {
    const openDate = new Date(lot.activity.date);
    const daysOpen = differenceInDays(new Date(), openDate);

    // Calculate total dividends for open position
    const totalDividends = this.includeDividends
      ? lot.dividends.reduce((sum, div) => sum + div.amount, 0)
      : 0;

    // Initial values (will be updated with real market prices)
    const currentPrice = lot.activity.unitPrice;
    const contractMultiplier = this.getContractMultiplier(lot.activity);
    const marketValue = currentPrice * lot.remainingQuantity * contractMultiplier;
    const costBasis = lot.activity.unitPrice * lot.remainingQuantity * contractMultiplier;
    const isShort = this.isShortOpeningActivity(lot.activity);
    const unrealizedPL = isShort
      ? costBasis - marketValue + totalDividends
      : marketValue - costBasis + totalDividends;
    const unrealizedReturnPercent = costBasis > 0 ? unrealizedPL / costBasis : 0;

    return {
      id: `${lot.activity.id}-open-${Date.now()}`,
      openingActivityType: lot.activity.activityType,
      openingSubtype: lot.activity.subtype,
      symbol,
      contractMultiplier,
      direction: isShort ? "SHORT" : "LONG",
      assetId: lot.activity.assetId,
      assetName: lot.activity.assetName || undefined,
      quantity: lot.remainingQuantity,
      averageCost: lot.activity.unitPrice,
      currentPrice,
      marketValue,
      unrealizedPL,
      unrealizedReturnPercent,
      totalDividends,
      daysOpen,
      openDate,
      accountId: lot.activity.accountId,
      accountName: lot.activity.accountName,
      currency: lot.activity.currency,
      activityIds: [lot.activity.id],
    };
  }

  /**
   * Calculate total dividends for a trade based on holding period
   */
  private calculateTradeDividends(
    entryDate: Date,
    exitDate: Date,
    dividends: ParsedActivity[],
  ): number {
    if (!this.includeDividends || dividends.length === 0) return 0;

    return dividends
      .filter((dividend) => {
        const divDate = new Date(dividend.date);
        return divDate >= entryDate && divDate <= exitDate;
      })
      .reduce((sum, dividend) => {
        // For dividends, the total amount is in the 'amount' field, not unitPrice * quantity
        return sum + dividend.amount;
      }, 0);
  }
}
