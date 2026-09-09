import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { SwingDashboardData, ClosedTrade, SwingDashboardPeriod } from "../types";
import { useSwingActivities } from "./use-swing-activities";
import { useSwingPreferences } from "./use-swing-preferences";
import { useHoldings } from "./use-holdings";
import { TradeMatcher, PerformanceCalculator } from "../lib";
import { useCurrencyConversion } from "./use-currency-conversion";
import { updateOpenPositionsWithMarketPrices } from "../lib/position-valuation";
import { useAssetProfiles } from "./use-asset-profiles";
import { startOfDay, endOfDay, startOfYear, subMonths, subYears } from "date-fns";

type ChartPeriodType = "daily" | "weekly" | "monthly";

/**
 * Custom hook for managing swing trading dashboard data
 *
 * DESIGN PRINCIPLE:
 * - Open positions and their unrealized P/L are ALWAYS shown (current portfolio state)
 * - Period filtering only applies to:
 *   - Closed trades (historical performance)
 *   - Charts and historical analysis
 *   - Realized P/L metrics
 * - Total P/L combines: period-filtered realized P/L + ALL unrealized P/L
 * - Chart granularity adapts to period: 1M=daily, 3M=weekly, others=monthly
 */
export function useSwingDashboard(ctx: AddonContext, period: SwingDashboardPeriod) {
  const { data: activities } = useSwingActivities(ctx);
  const { preferences } = useSwingPreferences(ctx);
  const { exchangeRates, baseCurrency } = useCurrencyConversion({ ctx });

  // Auto-detect optimal chart period type based on selected period
  const autoChartPeriodType = useMemo((): ChartPeriodType => {
    switch (period) {
      case "1M":
        return "daily";
      case "3M":
        return "weekly";
      default:
        return "monthly";
    }
  }, [period]);

  // Get unique account IDs from selected activities for holdings data
  const accountIds = useMemo(() => {
    if (!activities) return [];

    return [
      ...new Set(
        activities
          .filter((activity) => {
            return (
              preferences.selectedActivityIds.includes(activity.id) ||
              (preferences.includeSwingTag && activity.hasSwingTag)
            );
          })
          .map((activity) => activity.accountId),
      ),
    ];
  }, [activities, preferences.selectedActivityIds, preferences.includeSwingTag]);

  const { data: holdings } = useHoldings({
    ctx,
    accountIds,
    enabled: accountIds.length > 0,
  });

  const selectedActivities = useMemo(
    () => filterSelectedActivities(activities ?? [], preferences),
    [activities, preferences],
  );
  const profiles = useAssetProfiles(
    ctx,
    selectedActivities.map((activity) => activity.assetId),
  );

  const query = useQuery({
    queryKey: [
      "swing-dashboard",
      period,
      autoChartPeriodType, // Use auto-detected period type
      preferences.selectedActivityIds,
      preferences.lotMatchingMethod,
      preferences.includeFees,
      preferences.includeDividends,
      holdings,
      selectedActivities,
      profiles.data,
      exchangeRates,
      baseCurrency,
    ],
    queryFn: async (): Promise<SwingDashboardData> => {
      if (!activities) {
        throw new Error("Activities not loaded");
      }

      if (!profiles.data) throw new Error("Asset profiles not loaded");

      // Match trades using all selected activities (no date filtering here)
      const tradeMatcher = new TradeMatcher({
        assets: new Map(profiles.data.map((asset) => [asset.id, asset])),
        lotMethod: preferences.lotMatchingMethod,
        includeFees: preferences.includeFees,
        includeDividends: preferences.includeDividends,
      });

      const { closedTrades, openPositions } = tradeMatcher.matchTrades(selectedActivities);

      // Set up currency conversion - use base currency instead of preference to avoid unnecessary conversion
      const reportingCurrency = baseCurrency; // Always use base currency for consistency
      const fxRateMap = createFxRateMap(exchangeRates, reportingCurrency);

      // Update ALL open positions with current market prices (never filtered by period)
      const updatedOpenPositions = updateOpenPositionsWithMarketPrices(
        openPositions,
        holdings || [],
      );

      // Get date range for the selected period (only for historical data)
      const { startDate, endDate } = getDateRangeForPeriod(period);

      // Filter closed trades for the selected period (historical performance)
      const periodClosedTrades = filterTradesByPeriod(closedTrades, startDate, endDate);

      // Calculate metrics with hybrid approach:
      // - Realized P/L: only from period-filtered closed trades
      // - Unrealized P/L: from ALL open positions (current portfolio state)
      // - Total P/L: period realized + all unrealized
      const periodCalculator = new PerformanceCalculator(periodClosedTrades);
      const metrics = periodCalculator.calculateMetrics(
        updatedOpenPositions, // ALL open positions, not period-filtered
        reportingCurrency,
        fxRateMap,
      );

      // For charts and historical analysis, use period-filtered data
      const historicalCalculator = new PerformanceCalculator(periodClosedTrades);

      // Calculate period P/L for chart using auto-detected granularity
      const periodPL = historicalCalculator.calculatePeriodPL(
        autoChartPeriodType,
        reportingCurrency,
        fxRateMap,
      );

      // Calculate distribution for the selected period (historical analysis)
      const distribution = historicalCalculator.calculateDistribution(fxRateMap);

      // Generate calendar data from ALL closed trades — the calendar component
      // handles year filtering internally via selectedYear navigation
      const calendarCalculator = new PerformanceCalculator(closedTrades);
      const calendar = calendarCalculator.calculateCalendar(fxRateMap);

      // Calculate equity curve for the selected period (historical performance)
      const equityCurve = historicalCalculator.calculateEquityCurve(reportingCurrency, fxRateMap);

      return {
        metrics, // Hybrid: period realized P/L + all unrealized P/L
        closedTrades: periodClosedTrades, // Period-filtered historical trades
        allClosedTrades: closedTrades, // All closed trades for calendar drill-down
        openPositions: updatedOpenPositions, // ALL current open positions
        equityCurve, // Period-filtered historical performance
        periodPL, // Period-filtered chart data
        distribution, // Period-filtered analysis
        calendar, // Period-aware calendar
      };
    },
    enabled: !!activities && !!ctx.api && !!exchangeRates && !!profiles.data,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
  return {
    ...query,
    error: profiles.error ?? query.error,
    isLoading: profiles.isPending || query.isLoading,
    isPending: !profiles.error && (profiles.isPending || query.isPending),
    refetch: async () => {
      await profiles.refetch();
      return query.refetch();
    },
  };
}

/**
 * Filter activities based on user preferences
 */
function filterSelectedActivities(activities: any[], preferences: any) {
  // First pass: collect symbols from selected BUY/SELL activities
  const selectedSymbols = new Set<string>();
  for (const activity of activities) {
    if (activity.activityType === "SPLIT") continue;
    const isSelected =
      preferences.selectedActivityIds.includes(activity.id) ||
      (preferences.includeSwingTag && activity.hasSwingTag);
    if (isSelected) {
      selectedSymbols.add(JSON.stringify([activity.accountId, activity.assetId]));
    }
  }

  // Second pass: include selected activities + SPLIT activities for those symbols
  return activities.filter((activity) => {
    if (activity.activityType === "SPLIT") {
      return selectedSymbols.has(JSON.stringify([activity.accountId, activity.assetId]));
    }

    if (preferences.selectedActivityIds.includes(activity.id)) {
      return true;
    }

    if (preferences.includeSwingTag && activity.hasSwingTag) {
      return true;
    }

    return false;
  });
}

/**
 * Create FX rate map for currency conversion
 */
function createFxRateMap(
  exchangeRates: any[] | undefined,
  reportingCurrency: string,
): Record<string, number> {
  const fxRateMap: Record<string, number> = {};

  // Set reporting currency rate to 1
  fxRateMap[reportingCurrency] = 1;

  // Build conversion rates to reporting currency
  (exchangeRates || []).forEach((rate) => {
    if (rate.toCurrency === reportingCurrency) {
      // Direct rate: fromCurrency -> reportingCurrency
      fxRateMap[rate.fromCurrency] = rate.rate;
    } else if (rate.fromCurrency === reportingCurrency) {
      // Inverse rate: toCurrency -> reportingCurrency (1/rate)
      fxRateMap[rate.toCurrency] = rate.rate > 0 ? 1 / rate.rate : 1;
    }
  });

  return fxRateMap;
}

/**
 * Get date range for the selected period
 */
function getDateRangeForPeriod(period: SwingDashboardPeriod): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = endOfDay(now);
  let startDate: Date;

  switch (period) {
    case "1M":
      startDate = startOfDay(subMonths(now, 1));
      break;
    case "3M":
      startDate = startOfDay(subMonths(now, 3));
      break;
    case "6M":
      startDate = startOfDay(subMonths(now, 6));
      break;
    case "YTD":
      startDate = startOfYear(now);
      break;
    case "1Y":
      startDate = startOfDay(subYears(now, 1));
      break;
    case "ALL":
    default:
      startDate = new Date(2000, 0, 1); // Far back date
      break;
  }

  return { startDate, endDate };
}

/**
 * Filter closed trades by date range (for historical performance analysis)
 */
function filterTradesByPeriod(
  trades: ClosedTrade[],
  startDate: Date,
  endDate: Date,
): ClosedTrade[] {
  // For 'ALL' period, return all trades
  if (startDate.getFullYear() === 2000) {
    return trades;
  }

  // Filter trades by exit date within the period
  return trades.filter((trade) => {
    const exitDate = new Date(trade.exitDate);
    return exitDate >= startDate && exitDate <= endDate;
  });
}
