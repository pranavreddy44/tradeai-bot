// ============================================================
// Groww API Comprehensive Test Route
// Tests ALL endpoints in a single server-side call
// ============================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  GrowwClient,
  getGrowwClient,
  GROWW_CONSTANTS,
  type GrowwAuthConfig,
} from '@/lib/broker/groww-client';

export async function GET() {
  const results: Record<string, { status: 'success' | 'error'; data?: any; error?: string; latency_ms?: number }> = {};

  // Get credentials from DB
  const credential = await db.brokerCredential.findFirst({
    where: { broker: 'groww', isActive: true },
  });

  if (!credential || !credential.accessToken) {
    return NextResponse.json({ error: 'No active Groww credentials found', results });
  }

  const config: GrowwAuthConfig = {
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret || undefined,
    totpSecret: credential.totpSecret || undefined,
    authMethod: (credential.authMethod as 'approval' | 'totp' | 'direct'),
    accessToken: credential.accessToken,
  };

  const client = getGrowwClient(config);

  // ─── Category 1: User & Profile ─────────────────────────
  const profileTests: [string, () => Promise<any>][] = [
    ['1_profile', () => client.getUserProfile()],
  ];

  // ─── Category 2: Portfolio & Margin ─────────────────────
  const portfolioTests: [string, () => Promise<any>][] = [
    ['2_margin', () => client.getAvailableMargin()],
    ['3_holdings', () => client.getHoldings()],
    ['4_positions_cash', () => client.getPositions('CASH')],
    ['5_positions_fno', () => client.getPositions('FNO')],
  ];

  // ─── Category 3: Orders ─────────────────────────────────
  const orderTests: [string, () => Promise<any>][] = [
    ['6_order_list', () => client.getOrderList({ page: 0, page_size: 10 })],
    // Order placement test - will fail but tests the API path
    ['7_place_order_test', () => client.placeOrder({
      trading_symbol: 'RELIANCE',
      quantity: 1,
      exchange: 'NSE',
      segment: 'CASH',
      product: 'CNC',
      order_type: 'MARKET',
      transaction_type: 'BUY',
    }).catch(e => ({ error: e.message, note: 'Expected to fail - testing API path only' }))],
  ];

  // ─── Category 4: Market Data (Live) ─────────────────────
  const marketDataTests: [string, () => Promise<any>][] = [
    // LTP - uses NSE_RELIANCE format (handled by client)
    ['8_ltp_reliance', () => client.getLTP('NSE:RELIANCE', 'CASH')],
    ['9_ltp_nifty', () => client.getLTP('NSE:NIFTY 50', 'CASH')],
    // Quote - uses trading_symbol param directly
    ['10_quote_reliance', () => client.getQuote('RELIANCE', 'NSE', 'CASH')],
    // OHLC - uses NSE_RELIANCE format (handled by client)
    ['11_ohlc_reliance', () => client.getOHLC('NSE:RELIANCE', 'CASH')],
  ];

  // ─── Category 5: Options Data ───────────────────────────
  const optionsTests: [string, () => Promise<any>][] = [
    // Option chain with expiry date (required)
    ['12_option_chain_nifty', () => client.getOptionChain('NSE', 'NIFTY', '2025-07-03')],
    ['13_option_chain_banknifty', () => client.getOptionChain('NSE', 'BANKNIFTY', '2025-07-03')],
  ];

  // ─── Category 6: Historical Data ────────────────────────
  const historicalTests: [string, () => Promise<any>][] = [
    ['14_expiries_nifty', () => client.getExpiries('NSE', 'NIFTY', 2025, 7)],
    ['15_contracts_nifty', () => client.getContracts('NSE', 'NIFTY', '2025-07-31')],
    // Historical candles - correct format: groww_symbol=RELIANCE, candle_interval=1day
    ['16_historical_candles_1day', () => client.getHistoricalCandles({
      exchange: 'NSE',
      segment: 'CASH',
      groww_symbol: 'RELIANCE',
      start_time: '2025-06-01T09:15:00',
      end_time: '2025-06-14T15:30:00',
      candle_interval: '1day',
    })],
    ['17_historical_candles_5min', () => client.getHistoricalCandles({
      exchange: 'NSE',
      segment: 'CASH',
      groww_symbol: 'RELIANCE',
      start_time: '2025-06-13T09:15:00',
      end_time: '2025-06-13T15:30:00',
      candle_interval: '5minute',
    })],
  ];

  // Run all tests
  const allTests = [
    ...profileTests,
    ...portfolioTests,
    ...orderTests,
    ...marketDataTests,
    ...optionsTests,
    ...historicalTests,
  ];

  const categories = {
    'User & Profile': profileTests.map(t => t[0]),
    'Portfolio & Margin': portfolioTests.map(t => t[0]),
    'Orders': orderTests.map(t => t[0]),
    'Market Data (Live)': marketDataTests.map(t => t[0]),
    'Options Data': optionsTests.map(t => t[0]),
    'Historical Data': historicalTests.map(t => t[0]),
  };

  for (const [name, testFn] of allTests) {
    const start = Date.now();
    try {
      const data = await testFn();
      results[name] = {
        status: 'success',
        data,
        latency_ms: Date.now() - start,
      };
    } catch (error: any) {
      results[name] = {
        status: 'error',
        error: error.message,
        latency_ms: Date.now() - start,
      };
    }
    // Small delay between API calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Calculate summary
  const summary = {
    total: allTests.length,
    success: Object.values(results).filter(r => r.status === 'success').length,
    error: Object.values(results).filter(r => r.status === 'error').length,
    categories,
  };

  return NextResponse.json({
    summary,
    results,
    authMethod: credential.authMethod,
    ddpiNote: results['1_profile']?.data?.payload?.ddpi_enabled === false
      ? '⚠️ DDPI is NOT enabled on this token. Please generate a fresh access token from Groww dashboard to reflect DDPI changes.'
      : undefined,
  });
}
