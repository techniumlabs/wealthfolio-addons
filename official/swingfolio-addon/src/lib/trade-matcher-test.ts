import { TradeMatcher } from "./trade-matcher";
import type { ActivityDetails, ActivityType } from "@wealthfolio/addon-sdk";

// Enhanced test data with dividends, fees, and various scenarios
const jsonActivities = `[
  {"id":"sell-nvda-aug","accountId":"test-account","assetId":"NVDA","activityType":"SELL","date":"2025-08-25T04:00:00+00:00","quantity":"200","unitPrice":"181.6","currency":"USD","fee":"2.5","amount":"36320","needsReview":false,"comment":"Swing trade exit","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-nvda-aug","accountId":"test-account","assetId":"NVDA","activityType":"BUY","date":"2025-08-20T04:00:00+00:00","quantity":"200","unitPrice":"170.5","currency":"USD","fee":"2.0","amount":"34100","needsReview":false,"comment":"Swing trade entry","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"dividend-aapl-q3","accountId":"test-account","assetId":"AAPL","activityType":"DIVIDEND","date":"2025-08-15T04:00:00+00:00","quantity":"0","unitPrice":"0","currency":"USD","fee":"0","amount":"42.5","needsReview":false,"comment":"Q3 dividend","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"AAPL","assetName":"Apple Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"sell-aapl-aug","accountId":"test-account","assetId":"AAPL","activityType":"SELL","date":"2025-08-06T04:00:00+00:00","quantity":"170","unitPrice":"214.95","currency":"USD","fee":"1.5","amount":"36541.5","needsReview":false,"comment":"Long term hold exit","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"AAPL","assetName":"Apple Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"sell-shop-jul","accountId":"test-account","assetId":"SHOP.TO","activityType":"SELL","date":"2025-07-02T04:00:00+00:00","quantity":"220","unitPrice":"158.8","currency":"CAD","fee":"3.0","amount":"34936","needsReview":false,"comment":"Canadian swing trade","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"SHOP.TO","assetName":"Shopify Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-amzn-jul","accountId":"test-account","assetId":"AMZN.TO","activityType":"BUY","date":"2025-07-01T04:00:00+00:00","quantity":"1000","unitPrice":"25.32","currency":"CAD","fee":"5.0","amount":"25320","needsReview":false,"comment":"Long term investment","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"AMZN.TO","assetName":"Amazon.com, Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-shop-jun","accountId":"test-account","assetId":"SHOP.TO","activityType":"BUY","date":"2025-06-12T04:00:00+00:00","quantity":"220","unitPrice":"148.7","currency":"CAD","fee":"2.5","amount":"32713.999999999996","needsReview":false,"comment":"Canadian swing entry","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"SHOP.TO","assetName":"Shopify Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"dividend-aapl-q2","accountId":"test-account","assetId":"AAPL","activityType":"DIVIDEND","date":"2025-05-15T04:00:00+00:00","quantity":"0","unitPrice":"0","currency":"USD","fee":"0","amount":"38.25","needsReview":false,"comment":"Q2 dividend","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"AAPL","assetName":"Apple Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"sell-googl-may","accountId":"test-account","assetId":"GOOGL.TO","activityType":"SELL","date":"2025-05-28T04:00:00+00:00","quantity":"1000","unitPrice":"29","currency":"CAD","fee":"4.0","amount":"29000","needsReview":false,"comment":"Quick profit","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"GOOGL.TO","assetName":"GOOGL.TO","assetQuoteMode":"MANUAL","isSelected":false,"hasSwingTag":false},
  {"id":"sell-tqqq-may","accountId":"test-account","assetId":"TQQQ","activityType":"SELL","date":"2025-05-25T04:00:00+00:00","quantity":"100","unitPrice":"90.82","currency":"USD","fee":"1.0","amount":"9082","needsReview":false,"comment":"Leveraged ETF trade","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"TQQQ","assetName":"ProShares UltraPro QQQ","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-tqqq-may","accountId":"test-account","assetId":"TQQQ","activityType":"BUY","date":"2025-05-14T04:00:00+00:00","quantity":"100","unitPrice":"69.37","currency":"USD","fee":"1.0","amount":"6937","needsReview":false,"comment":"Leveraged ETF entry","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"TQQQ","assetName":"ProShares UltraPro QQQ","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-vfv-may","accountId":"test-account","assetId":"VFV.TO","activityType":"BUY","date":"2025-05-14T04:00:00+00:00","quantity":"200","unitPrice":"145.65","currency":"CAD","fee":"0","amount":"29130","needsReview":false,"comment":"Index fund","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"VFV.TO","assetName":"Vanguard S&P 500 Index ETF","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"sell-shop-may","accountId":"test-account","assetId":"SHOP.TO","activityType":"SELL","date":"2025-05-12T04:00:00+00:00","quantity":"222","unitPrice":"145","currency":"CAD","fee":"2.0","amount":"32190","needsReview":false,"comment":"First SHOP trade","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"SHOP.TO","assetName":"Shopify Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-googl-may","accountId":"test-account","assetId":"GOOGL.TO","activityType":"BUY","date":"2025-05-07T04:00:00+00:00","quantity":"1000","unitPrice":"24.85","currency":"CAD","fee":"3.0","amount":"24850","needsReview":false,"comment":"Manual entry","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"GOOGL.TO","assetName":"GOOGL.TO","assetQuoteMode":"MANUAL","isSelected":false,"hasSwingTag":false},
  {"id":"buy-shop-may","accountId":"test-account","assetId":"SHOP.TO","activityType":"BUY","date":"2025-05-06T04:00:00+00:00","quantity":"222","unitPrice":"130.4","currency":"CAD","fee":"2.5","amount":"28948.8","needsReview":false,"comment":"Canadian stock entry","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"SHOP.TO","assetName":"Shopify Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-aapl-may","accountId":"test-account","assetId":"AAPL","activityType":"BUY","date":"2025-05-02T04:00:00+00:00","quantity":"170","unitPrice":"204.7","currency":"USD","fee":"3.5","amount":"34799","needsReview":false,"comment":"Long term position","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"AAPL","assetName":"Apple Inc.","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"sell-nvda-may","accountId":"test-account","assetId":"NVDA","activityType":"SELL","date":"2025-05-02T04:00:00+00:00","quantity":"365","unitPrice":"115","currency":"USD","fee":"5.0","amount":"41975","needsReview":false,"comment":"Partial exit","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"dividend-nvda-apr","accountId":"test-account","assetId":"NVDA","activityType":"DIVIDEND","date":"2025-04-20T04:00:00+00:00","quantity":"0","unitPrice":"0","currency":"USD","fee":"0","amount":"36.5","needsReview":false,"comment":"NVDA dividend","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-nvda-apr","accountId":"test-account","assetId":"NVDA","activityType":"BUY","date":"2025-04-16T04:00:00+00:00","quantity":"355","unitPrice":"100.8","currency":"USD","fee":"7.5","amount":"35784","needsReview":false,"comment":"Major position","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"dividend-nvda-feb","accountId":"test-account","assetId":"NVDA","activityType":"DIVIDEND","date":"2025-02-15T05:00:00+00:00","quantity":"0","unitPrice":"0","currency":"USD","fee":"0","amount":"11.8","needsReview":false,"comment":"Small NVDA dividend","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false},
  {"id":"buy-nvda-jan","accountId":"test-account","assetId":"NVDA","activityType":"BUY","date":"2025-01-28T05:00:00+00:00","quantity":"10","unitPrice":"118","currency":"USD","fee":"1.0","amount":"1180","needsReview":false,"comment":"Small test position","createdAt":"2025-08-25T22:38:05+00:00","updatedAt":"2025-08-25T22:38:05+00:00","accountName":"SWING-TEST","accountCurrency":"CAD","assetSymbol":"NVDA","assetName":"NVIDIA Corporation","assetQuoteMode":"MARKET","isSelected":false,"hasSwingTag":false}
]`;

const rawActivities = JSON.parse(jsonActivities);

const activities: ActivityDetails[] = rawActivities.map((a: any) => ({
  ...a,
  date: new Date(a.date),
  createdAt: new Date(a.createdAt),
  updatedAt: new Date(a.updatedAt),
  activityType: a.activityType as ActivityType,
}));

export function testTradeMatcher() {
  console.log("=== COMPREHENSIVE Trade Matcher Test ===");
  console.log(`Processing ${activities.length} activities...`);

  // Test 1: No fees, no dividends (baseline)
  console.log("\n=== TEST 1: BASELINE (No Fees, No Dividends) ===");
  const baselineMatcher = new TradeMatcher({
    lotMethod: "FIFO",
    includeFees: false,
    includeDividends: false,
  });
  const baselineResult = baselineMatcher.matchTrades(activities);
  const baselinePL = baselineResult.closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  console.log(
    `Closed Trades: ${baselineResult.closedTrades.length}, Total P/L: $${baselinePL.toFixed(2)}`,
  );

  // Test 2: With fees, no dividends
  console.log("\n=== TEST 2: WITH FEES (No Dividends) ===");
  const feesMatcher = new TradeMatcher({
    lotMethod: "FIFO",
    includeFees: true,
    includeDividends: false,
  });
  const feesResult = feesMatcher.matchTrades(activities);
  const feesPL = feesResult.closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  const totalFees = feesResult.closedTrades.reduce((sum, trade) => sum + trade.totalFees, 0);
  console.log(
    `Closed Trades: ${feesResult.closedTrades.length}, Total P/L: $${feesPL.toFixed(2)}, Total Fees: $${totalFees.toFixed(2)}`,
  );
  console.log(`Fee Impact: $${(feesPL - baselinePL).toFixed(2)}`);

  // Test 3: No fees, with dividends
  console.log("\n=== TEST 3: WITH DIVIDENDS (No Fees) ===");
  const dividendsMatcher = new TradeMatcher({
    lotMethod: "FIFO",
    includeFees: false,
    includeDividends: true,
  });
  const dividendsResult = dividendsMatcher.matchTrades(activities);
  const dividendsPL = dividendsResult.closedTrades.reduce(
    (sum, trade) => sum + trade.realizedPL,
    0,
  );
  const totalDividends = dividendsResult.closedTrades.reduce(
    (sum, trade) => sum + trade.totalDividends,
    0,
  );
  console.log(
    `Closed Trades: ${dividendsResult.closedTrades.length}, Total P/L: $${dividendsPL.toFixed(2)}, Total Dividends: $${totalDividends.toFixed(2)}`,
  );
  console.log(`Dividend Impact: $${(dividendsPL - baselinePL).toFixed(2)}`);

  // Test 4: With both fees and dividends
  console.log("\n=== TEST 4: FULL CALCULATION (Fees + Dividends) ===");
  const fullMatcher = new TradeMatcher({
    lotMethod: "FIFO",
    includeFees: true,
    includeDividends: true,
  });
  const fullResult = fullMatcher.matchTrades(activities);
  const fullPL = fullResult.closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  const fullFees = fullResult.closedTrades.reduce((sum, trade) => sum + trade.totalFees, 0);
  const fullDividends = fullResult.closedTrades.reduce(
    (sum, trade) => sum + trade.totalDividends,
    0,
  );
  console.log(`Closed Trades: ${fullResult.closedTrades.length}, Total P/L: $${fullPL.toFixed(2)}`);
  console.log(`Total Fees: $${fullFees.toFixed(2)}, Total Dividends: $${fullDividends.toFixed(2)}`);
  console.log(`Net Impact: $${(fullPL - baselinePL).toFixed(2)} (should equal dividends - fees)`);

  // Test detailed trade breakdown
  console.log("\n=== DETAILED TRADE BREAKDOWN (FIFO with Fees & Dividends) ===");
  fullResult.closedTrades.forEach((trade, i) => {
    console.log(`${i + 1}. ${trade.symbol}: ${trade.quantity} shares`);
    console.log(`   Entry: ${trade.entryDate.toISOString().slice(0, 10)} @ $${trade.entryPrice}`);
    console.log(`   Exit: ${trade.exitDate.toISOString().slice(0, 10)} @ $${trade.exitPrice}`);
    console.log(
      `   Fees: $${trade.totalFees.toFixed(2)}, Dividends: $${trade.totalDividends.toFixed(2)}`,
    );
    console.log(
      `   P&L: $${trade.realizedPL.toFixed(2)} (${(trade.returnPercent * 100).toFixed(2)}%)`,
    );
  });

  // Test open positions
  console.log("\n=== OPEN POSITIONS ===");
  fullResult.openPositions.forEach((pos) => {
    console.log(`${pos.symbol}: ${pos.quantity} shares @ avg $${pos.averageCost.toFixed(2)}`);
    console.log(
      `   Dividends: $${pos.totalDividends.toFixed(2)}, Unrealized P&L: $${pos.unrealizedPL.toFixed(2)} (${(pos.unrealizedReturnPercent * 100).toFixed(2)}%)`,
    );
  });

  // Test 5: Compare lot methods with full calculations
  console.log("\n=== LOT METHOD COMPARISON (Full Calculations) ===");

  const avgMatcher = new TradeMatcher({
    lotMethod: "AVERAGE",
    includeFees: true,
    includeDividends: true,
  });
  const avgResult = avgMatcher.matchTrades(activities);
  const avgPL = avgResult.closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);

  const lifoMatcher = new TradeMatcher({
    lotMethod: "LIFO",
    includeFees: true,
    includeDividends: true,
  });
  const lifoResult = lifoMatcher.matchTrades(activities);
  const lifoPL = lifoResult.closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);

  console.log(`FIFO Total P/L: $${fullPL.toFixed(2)} (${fullResult.closedTrades.length} trades)`);
  console.log(`AVERAGE Total P/L: $${avgPL.toFixed(2)} (${avgResult.closedTrades.length} trades)`);
  console.log(`LIFO Total P/L: $${lifoPL.toFixed(2)} (${lifoResult.closedTrades.length} trades)`);

  // Test 6: Summary of dividend activities
  const dividendActivities = activities.filter((a) => a.activityType === "DIVIDEND");
  if (dividendActivities.length > 0) {
    console.log("\n=== DIVIDEND ACTIVITIES ===");
    dividendActivities.forEach((div) => {
      console.log(
        `${div.date.toISOString().slice(0, 10)}: ${div.assetSymbol} - $${div.amount} (${div.comment})`,
      );
    });
    const totalDividendAmount = dividendActivities.reduce(
      (sum, div) => sum + Number(div.amount || 0),
      0,
    );
    console.log(`Total Dividend Amount in Data: $${totalDividendAmount.toFixed(2)}`);
  }

  // Test 7: Option-specific behavior assertions
  console.log("\n=== TEST 7: OPTION OPEN/CLOSE + SHORT BEHAVIOR ===");

  const optionActivities: ActivityDetails[] = [
    {
      id: "opt-close-short",
      accountId: "opt-account",
      assetId: "opt-asset",
      activityType: "BUY" as ActivityType,
      subtype: "POSITION_CLOSE",
      date: new Date("2026-08-20T00:00:00.000Z"),
      quantity: "2",
      unitPrice: "0.01",
      currency: "USD",
      fee: "0",
      amount: "0.02",
      needsReview: false,
      comment: "close short put",
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      accountName: "OPT-TEST",
      accountCurrency: "USD",
      assetSymbol: "BIDU260821P00094000",
      assetName: "BIDU Aug 2026 94.000 put",
      assetQuoteMode: "MARKET",
      instrumentType: "OPTION",
      isSelected: false,
      hasSwingTag: false,
    } as unknown as ActivityDetails,
    {
      id: "opt-open-short",
      accountId: "opt-account",
      assetId: "opt-asset",
      activityType: "SELL" as ActivityType,
      subtype: "POSITION_OPEN",
      date: new Date("2026-07-27T00:00:00.000Z"),
      quantity: "2",
      unitPrice: "1.59",
      currency: "USD",
      fee: "0",
      amount: "3.18",
      needsReview: false,
      comment: "open short put",
      createdAt: new Date("2026-07-27T00:00:00.000Z"),
      updatedAt: new Date("2026-07-27T00:00:00.000Z"),
      accountName: "OPT-TEST",
      accountCurrency: "USD",
      assetSymbol: "BIDU260821P00094000",
      assetName: "BIDU Aug 2026 94.000 put",
      assetQuoteMode: "MARKET",
      instrumentType: "OPTION",
      isSelected: false,
      hasSwingTag: false,
    } as unknown as ActivityDetails,
  ];

  const optionMatcher = new TradeMatcher({
    lotMethod: "FIFO",
    includeFees: true,
    includeDividends: false,
  });

  const optionResult = optionMatcher.matchTrades(optionActivities);

  if (optionResult.closedTrades.length !== 1) {
    throw new Error(
      `Expected 1 closed option trade, got ${optionResult.closedTrades.length}`,
    );
  }
  if (optionResult.openPositions.length !== 0) {
    throw new Error(
      `Expected 0 open option positions, got ${optionResult.openPositions.length}`,
    );
  }
  if (optionResult.unmatchedSells.length !== 0 || optionResult.unmatchedBuys.length !== 0) {
    throw new Error(
      `Expected no unmatched option activities, got sells=${optionResult.unmatchedSells.length}, buys=${optionResult.unmatchedBuys.length}`,
    );
  }

  const optionTrade = optionResult.closedTrades[0];
  const expectedShortPL = 2 * (1.59 - 0.01) * 100;
  if (Math.abs(optionTrade.realizedPL - expectedShortPL) > 0.0001) {
    throw new Error(
      `Expected short option realized P/L ${expectedShortPL.toFixed(2)}, got ${optionTrade.realizedPL.toFixed(2)}`,
    );
  }

  // Ensure OPTION classification uses subtype semantics.
  const optionLongActivities: ActivityDetails[] = [
    {
      id: "opt-open-long",
      accountId: "opt-account",
      assetId: "opt-asset-long",
      activityType: "BUY" as ActivityType,
      subtype: "POSITION_OPEN",
      date: new Date("2026-06-01T00:00:00.000Z"),
      quantity: "1",
      unitPrice: "2.5",
      currency: "USD",
      fee: "0",
      amount: "2.5",
      needsReview: false,
      comment: "open long call",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      accountName: "OPT-TEST",
      accountCurrency: "USD",
      assetSymbol: "AAPL260919C00200000",
      assetName: "AAPL Sep 2026 200.000 call",
      assetQuoteMode: "MARKET",
      instrumentType: "OPTION",
      isSelected: false,
      hasSwingTag: false,
    } as unknown as ActivityDetails,
    {
      id: "opt-close-long",
      accountId: "opt-account",
      assetId: "opt-asset-long",
      activityType: "SELL" as ActivityType,
      subtype: "POSITION_CLOSE",
      date: new Date("2026-06-10T00:00:00.000Z"),
      quantity: "1",
      unitPrice: "3.2",
      currency: "USD",
      fee: "0",
      amount: "3.2",
      needsReview: false,
      comment: "close long call",
      createdAt: new Date("2026-06-10T00:00:00.000Z"),
      updatedAt: new Date("2026-06-10T00:00:00.000Z"),
      accountName: "OPT-TEST",
      accountCurrency: "USD",
      assetSymbol: "AAPL260919C00200000",
      assetName: "AAPL Sep 2026 200.000 call",
      assetQuoteMode: "MARKET",
      instrumentType: "OPTION",
      isSelected: false,
      hasSwingTag: false,
    } as unknown as ActivityDetails,
  ];

  const optionLongResult = optionMatcher.matchTrades(optionLongActivities);
  if (optionLongResult.closedTrades.length !== 1) {
    throw new Error(
      `Expected 1 closed long option trade, got ${optionLongResult.closedTrades.length}`,
    );
  }

  if (optionLongResult.unmatchedBuys.length !== 0 || optionLongResult.unmatchedSells.length !== 0) {
    throw new Error(
      `Expected no unmatched long option activities, got sells=${optionLongResult.unmatchedSells.length}, buys=${optionLongResult.unmatchedBuys.length}`,
    );
  }

  // Ensure EQUITY still uses BUY/SELL semantics.
  const equityActivities: ActivityDetails[] = [
    {
      id: "eq-open",
      accountId: "eq-account",
      assetId: "eq-asset",
      activityType: "BUY" as ActivityType,
      date: new Date("2026-01-01T00:00:00.000Z"),
      quantity: "10",
      unitPrice: "100",
      currency: "USD",
      fee: "0",
      amount: "1000",
      needsReview: false,
      comment: "open equity",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      accountName: "EQ-TEST",
      accountCurrency: "USD",
      assetSymbol: "MSFT",
      assetName: "Microsoft Corp",
      assetQuoteMode: "MARKET",
      instrumentType: "EQUITY",
      isSelected: false,
      hasSwingTag: false,
    } as unknown as ActivityDetails,
    {
      id: "eq-close",
      accountId: "eq-account",
      assetId: "eq-asset",
      activityType: "SELL" as ActivityType,
      date: new Date("2026-01-02T00:00:00.000Z"),
      quantity: "10",
      unitPrice: "110",
      currency: "USD",
      fee: "0",
      amount: "1100",
      needsReview: false,
      comment: "close equity",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      accountName: "EQ-TEST",
      accountCurrency: "USD",
      assetSymbol: "MSFT",
      assetName: "Microsoft Corp",
      assetQuoteMode: "MARKET",
      instrumentType: "EQUITY",
      isSelected: false,
      hasSwingTag: false,
    } as unknown as ActivityDetails,
  ];

  const equityResult = optionMatcher.matchTrades(equityActivities);
  if (equityResult.closedTrades.length !== 1) {
    throw new Error(`Expected 1 closed equity trade, got ${equityResult.closedTrades.length}`);
  }

  console.log("Option-specific assertions passed.");
}

// Run the test
testTradeMatcher();
