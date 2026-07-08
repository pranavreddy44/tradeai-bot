// ============================================================
// Groww Trade API Client - TypeScript REST API Wrapper
// Reverse-engineered from the official growwapi Python SDK
// Base URL: https://api.groww.in/v1
// ============================================================

import { createHash, createHmac, randomUUID } from 'crypto';

// ─── Constants ─────────────────────────────────────────────

export const GROWW_CONSTANTS = {
  // Base URLs
  BASE_URL: 'https://api.groww.in/v1',
  TOKEN_URL: 'https://api.groww.in/v1/token/api/access',

  // Exchanges
  EXCHANGE_NSE: 'NSE',
  EXCHANGE_BSE: 'BSE',
  EXCHANGE_MCX: 'MCX',

  // Segments
  SEGMENT_CASH: 'CASH',
  SEGMENT_FNO: 'FNO',
  SEGMENT_COMMODITY: 'COMMODITY',

  // Order Types
  ORDER_TYPE_LIMIT: 'LIMIT',
  ORDER_TYPE_MARKET: 'MARKET',
  ORDER_TYPE_SL: 'SL',
  ORDER_TYPE_SL_M: 'SL_M',

  // Products
  PRODUCT_CNC: 'CNC',
  PRODUCT_MIS: 'MIS',
  PRODUCT_NRML: 'NRML',

  // Transaction Types
  TRANSACTION_TYPE_BUY: 'BUY',
  TRANSACTION_TYPE_SELL: 'SELL',

  // Validity
  VALIDITY_DAY: 'DAY',

  // Smart Order Types
  SMART_ORDER_TYPE_GTT: 'GTT',
  SMART_ORDER_TYPE_OCO: 'OCO',

  // Trigger Directions
  TRIGGER_DIRECTION_UP: 'UP',
  TRIGGER_DIRECTION_DOWN: 'DOWN',

  // Smart Order Statuses
  SMART_ORDER_STATUS_ACTIVE: 'ACTIVE',
  SMART_ORDER_STATUS_TRIGGERED: 'TRIGGERED',
  SMART_ORDER_STATUS_CANCELLED: 'CANCELLED',
  SMART_ORDER_STATUS_EXPIRED: 'EXPIRED',
  SMART_ORDER_STATUS_FAILED: 'FAILED',
  SMART_ORDER_STATUS_COMPLETED: 'COMPLETED',

  // Instrument CSV URL
  INSTRUMENT_CSV_URL: 'https://growwapi-assets.groww.in/instruments/instrument.csv',

  // Rate Limits
  RATE_LIMIT_ORDERS_PER_SEC: 10,
  RATE_LIMIT_ORDERS_PER_MIN: 250,
  RATE_LIMIT_LIVE_DATA_PER_SEC: 10,
  RATE_LIMIT_LIVE_DATA_PER_MIN: 300,
  RATE_LIMIT_NON_TRADING_PER_SEC: 20,
  RATE_LIMIT_NON_TRADING_PER_MIN: 500,
} as const;

// ─── Types ─────────────────────────────────────────────────

export interface GrowwAuthConfig {
  apiKey: string;
  apiSecret?: string; // For approval flow
  totpSecret?: string; // For TOTP flow
  authMethod: 'approval' | 'totp' | 'direct';
  accessToken?: string;
}

export interface GrowwPlaceOrderParams {
  trading_symbol: string;
  quantity: number;
  price?: number;
  trigger_price?: number;
  validity?: string;
  exchange?: string;
  segment?: string;
  product?: string;
  order_type?: string;
  transaction_type: string;
  order_reference_id?: string;
}

export interface GrowwModifyOrderParams {
  groww_order_id: string;
  quantity: number;
  price?: number;
  trigger_price?: number;
  order_type: string;
  segment: string;
}

export interface GrowwCancelOrderParams {
  groww_order_id: string;
  segment: string;
}

export interface GrowwCreateSmartOrderParams {
  smart_order_type: string;
  reference_id: string;
  segment: string;
  trading_symbol: string;
  quantity: number;
  product_type: string;
  exchange: string;
  duration: string;
  transaction_type?: string;
  net_position_quantity?: number;
  trigger_price?: string;
  trigger_direction?: string;
  order?: {
    order_type: string;
    price: string;
    transaction_type: string;
  };
  target?: {
    trigger_price: string;
    order_type?: string;
    price?: string | null;
  };
  stop_loss?: {
    trigger_price: string;
    order_type?: string;
    price?: string | null;
  };
}

export interface GrowwConnectionStatus {
  connected: boolean;
  accessTokenValid: boolean;
  profile?: {
    vendorUserId: string;
    ucc: string;
    nseEnabled: boolean;
    bseEnabled: boolean;
    activeSegments: string[];
  };
  margin?: {
    clearCash: number;
    netMarginUsed: number;
    collateralAvailable: number;
  };
  error?: string;
}

// ─── Helper: Generate SHA-256 Checksum ─────────────────────

function generateChecksum(data: string, salt: string): string {
  const input = data + salt;
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

function decodeBase32Secret(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.replace(/[\s=-]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid TOTP secret. Paste the base32 secret shown by Groww.');
    }
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// ─── Helper: Build Headers ────────────────────────────────

function buildHeaders(token: string): Record<string, string> {
  return {
    'x-request-id': randomUUID(),
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-client-id': 'growwapi',
    'x-client-platform': 'growwapi-ts-client',
    'x-client-platform-version': '1.5.0',
    'x-api-version': '1.0',
  };
}

// ─── Helper: Parse API Response ────────────────────────────

async function parseResponse(response: Response): Promise<any> {
  // Always try to read the body first for error details
  if (!response.ok) {
    let errorMsg = '';
    let errorCode = '';
    try {
      const data = await response.json();
      errorCode = data?.error?.code || '';
      errorMsg = data?.error?.displayMessage || data?.error?.message || data?.message || '';
    } catch {
      // Body not JSON
    }

    // Return specific error messages based on status + code
    if (response.status === 401) {
      if (errorCode === 'GA005' || errorMsg.includes('IP') || errorMsg.includes('ip')) {
        throw new Error(`IP_NOT_REGISTERED: ${errorMsg || 'No registered IPs found. Please register your server IP in Groww API dashboard.'}`);
      }
      throw new Error(`AUTHENTICATION_FAILED: ${errorMsg || 'Invalid or expired access token'}`);
    }
    if (response.status === 403) {
      // 403 on Groww often means IP not registered too
      if (errorMsg.includes('IP') || errorMsg.includes('ip') || errorMsg.includes('not registered') || errorMsg.includes('unauthorized')) {
        throw new Error(`IP_NOT_REGISTERED: ${errorMsg || 'Access denied — your server IP may not be registered in Groww API dashboard.'}`);
      }
      throw new Error(`AUTHORISATION_FAILED: ${errorMsg || 'Access denied. Your server IP may not be registered in Groww API dashboard. Register the IP and regenerate the access token.'}`);
    }
    if (response.status === 429) {
      throw new Error('RATE_LIMITED: Too many requests. Please slow down.');
    }
    if (response.status === 504) {
      throw new Error('TIMEOUT: The request timed out.');
    }

    throw new Error(`GROWW_API_ERROR[${errorCode}]: ${errorMsg || `HTTP ${response.status}`}`);
  }
  return response.json();
}

// ─── Groww Client Class ───────────────────────────────────

export class GrowwClient {
  private baseUrl: string = GROWW_CONSTANTS.BASE_URL;
  private accessToken: string;
  private apiKey: string;
  private apiSecret?: string;
  private totpSecret?: string;
  private authMethod: 'approval' | 'totp' | 'direct';

  constructor(config: GrowwAuthConfig) {
    this.accessToken = config.accessToken || '';
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.totpSecret = config.totpSecret;
    this.authMethod = config.authMethod;
  }

  // ─── Authentication ────────────────────────────────────

  /**
   * Generate access token using API Key + Secret (approval flow)
   * or API Key + TOTP (totp flow)
   * For 'direct' auth method, the token is already set via constructor
   */
  async generateAccessToken(totpCode?: string): Promise<string> {
    // Direct flow: token was already provided
    if (this.authMethod === 'direct') {
      if (!this.accessToken) {
        throw new Error('Direct auth method requires an access token to be provided');
      }
      return this.accessToken;
    }

    let requestBody: any;

    if (this.authMethod === 'totp') {
      if (!totpCode && !this.totpSecret) {
        throw new Error('TOTP code or TOTP secret is required for TOTP auth method');
      }
      // If we have a TOTP secret, generate the code programmatically
      const code = totpCode || this.generateTotpCode(this.totpSecret!);
      requestBody = {
        key_type: 'totp',
        totp: code.trim(),
      };
    } else {
      // Approval flow: API Key + Secret
      if (!this.apiSecret) {
        throw new Error('API Secret is required for approval auth method');
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const checksum = generateChecksum(this.apiSecret, String(timestamp));
      requestBody = {
        key_type: 'approval',
        checksum,
        timestamp,
      };
    }

    const headers = buildHeaders(this.apiKey);
    const response = await fetch(GROWW_CONSTANTS.TOKEN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (response.status === 400) {
      const data = await response.json();
      const msg = data?.error?.displayMessage || 'Bad Request - check your API credentials';
      throw new Error(`AUTH_ERROR: ${msg}`);
    }

    const data = await parseResponse(response);
    this.accessToken = data.token || data;
    return this.accessToken;
  }

  /**
   * Generate the standard 6-digit TOTP code from a base32 secret.
   */
  private generateTotpCode(secret: string): string {
    const key = decodeBase32Secret(secret);
    const counter = Math.floor(Date.now() / 30_000);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

    const digest = createHmac('sha1', key).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    return String(binary % 1_000_000).padStart(6, '0');
  }

  /**
   * Set access token directly (if already generated)
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Get current access token
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  // ─── User / Profile ────────────────────────────────────

  async getUserProfile(): Promise<any> {
    return this.get('/user/detail');
  }

  // ─── Orders ────────────────────────────────────────────

  async placeOrder(params: GrowwPlaceOrderParams): Promise<any> {
    const body = {
      trading_symbol: params.trading_symbol,
      quantity: params.quantity,
      price: params.price || 0,
      trigger_price: params.trigger_price || null,
      validity: params.validity || GROWW_CONSTANTS.VALIDITY_DAY,
      exchange: params.exchange || GROWW_CONSTANTS.EXCHANGE_NSE,
      segment: params.segment || GROWW_CONSTANTS.SEGMENT_CASH,
      product: params.product || GROWW_CONSTANTS.PRODUCT_MIS,
      order_type: params.order_type || GROWW_CONSTANTS.ORDER_TYPE_MARKET,
      transaction_type: params.transaction_type,
      // Groww requires: 8-20 char alphanumeric, at most 2 hyphens
      order_reference_id: params.order_reference_id || `TA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
    };
    return this.post('/order/create', body);
  }

  async modifyOrder(params: GrowwModifyOrderParams): Promise<any> {
    return this.post('/order/modify', {
      quantity: params.quantity,
      price: params.price,
      trigger_price: params.trigger_price,
      groww_order_id: params.groww_order_id,
      order_type: params.order_type,
      segment: params.segment,
    });
  }

  async cancelOrder(params: GrowwCancelOrderParams): Promise<any> {
    return this.post('/order/cancel', {
      segment: params.segment,
      groww_order_id: params.groww_order_id,
    });
  }

  async getOrderStatus(growwOrderId: string, segment: string): Promise<any> {
    return this.get(`/order/status/${growwOrderId}?segment=${segment}`);
  }

  async getOrderStatusByReference(orderReferenceId: string, segment: string): Promise<any> {
    return this.get(`/order/status/reference/${orderReferenceId}?segment=${segment}`);
  }

  async getOrderList(params?: { segment?: string; page?: number; page_size?: number }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.segment) queryParams.set('segment', params.segment);
    if (params?.page !== undefined) queryParams.set('page', String(params.page));
    if (params?.page_size !== undefined) queryParams.set('page_size', String(params.page_size));
    const qs = queryParams.toString();
    return this.get(`/order/list${qs ? '?' + qs : ''}`);
  }

  async getOrderDetail(growwOrderId: string, segment: string): Promise<any> {
    return this.get(`/order/detail/${growwOrderId}?segment=${segment}`);
  }

  async getTradeListForOrder(growwOrderId: string, segment: string, page = 0, pageSize = 50): Promise<any> {
    return this.get(`/order/trades/${growwOrderId}?segment=${segment}&page=${page}&page_size=${pageSize}`);
  }

  // ─── Smart Orders (GTT / OCO) ──────────────────────────

  async createSmartOrder(params: GrowwCreateSmartOrderParams): Promise<any> {
    return this.post('/order-advance/create', params);
  }

  async modifySmartOrder(smartOrderId: string, params: any): Promise<any> {
    return this.post(`/order-advance/modify/${smartOrderId}`, params);
  }

  async cancelSmartOrder(segment: string, smartOrderType: string, smartOrderId: string): Promise<any> {
    return this.post(`/order-advance/cancel/${segment}/${smartOrderType}/${smartOrderId}`, {});
  }

  async getSmartOrder(segment: string, smartOrderType: string, smartOrderId: string): Promise<any> {
    return this.get(`/order-advance/status/${segment}/${smartOrderType}/internal/${smartOrderId}`);
  }

  async getSmartOrderList(params: {
    segment?: string;
    smart_order_type?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params.segment) queryParams.set('segment', params.segment);
    if (params.smart_order_type) queryParams.set('smart_order_type', params.smart_order_type);
    if (params.status) queryParams.set('status', params.status);
    if (params.page !== undefined) queryParams.set('page', String(params.page));
    if (params.page_size !== undefined) queryParams.set('page_size', String(params.page_size));
    return this.get(`/order-advance/list?${queryParams.toString()}`);
  }

  // ─── Portfolio ─────────────────────────────────────────

  async getHoldings(): Promise<any> {
    return this.get('/holdings/user');
  }

  async getPositions(segment?: string): Promise<any> {
    const qs = segment ? `?segment=${segment}` : '';
    return this.get(`/positions/user${qs}`);
  }

  async getPositionForSymbol(tradingSymbol: string, segment: string): Promise<any> {
    return this.get(`/positions/trading-symbol?trading_symbol=${tradingSymbol}&segment=${segment}`);
  }

  // ─── Margin ────────────────────────────────────────────

  async getAvailableMargin(): Promise<any> {
    return this.get('/margins/detail/user');
  }

  async getOrderMarginDetails(orders: any[], segment: string): Promise<any> {
    return this.post(`/margins/detail/orders?segment=${segment}`, { orders });
  }

  // ─── Market Data ───────────────────────────────────────

  async getQuote(tradingSymbol: string, exchange: string, segment: string): Promise<any> {
    return this.get(`/live-data/quote?exchange=${exchange}&segment=${segment}&trading_symbol=${tradingSymbol}`);
  }

  async getLTP(exchangeTradingSymbols: string | string[], segment: string): Promise<any> {
    // Groww API expects format: NSE_RELIANCE (exchange_tradingSymbol with underscore)
    const symbols = Array.isArray(exchangeTradingSymbols)
      ? exchangeTradingSymbols.map(s => this.formatExchangeSymbol(s)).join(',')
      : this.formatExchangeSymbol(exchangeTradingSymbols);
    return this.get(`/live-data/ltp?segment=${segment}&exchange_symbols=${symbols}`);
  }

  async getOHLC(exchangeTradingSymbols: string | string[], segment: string): Promise<any> {
    // Groww API expects format: NSE_RELIANCE (exchange_tradingSymbol with underscore)
    const symbols = Array.isArray(exchangeTradingSymbols)
      ? exchangeTradingSymbols.map(s => this.formatExchangeSymbol(s)).join(',')
      : this.formatExchangeSymbol(exchangeTradingSymbols);
    return this.get(`/live-data/ohlc?segment=${segment}&exchange_symbols=${symbols}`);
  }

  async getOptionChain(exchange: string, underlying: string, expiryDate?: string): Promise<any> {
    let url = `/option-chain/exchange/${exchange}/underlying/${underlying}`;
    if (expiryDate) url += `?expiry_date=${expiryDate}`;
    return this.get(url);
  }

  async getGreeks(exchange: string, underlying: string, tradingSymbol: string, expiry: string): Promise<any> {
    return this.get(`/live-data/greeks/exchange/${exchange}/underlying/${underlying}/trading_symbol/${tradingSymbol}/expiry/${expiry}`);
  }

  // ─── Historical Data ───────────────────────────────────

  async getExpiries(exchange: string, underlyingSymbol: string, year: number, month: number): Promise<any> {
    return this.get(`/historical/expiries?exchange=${exchange}&underlying_symbol=${underlyingSymbol}&year=${year}&month=${month}`);
  }

  async getContracts(exchange: string, underlyingSymbol: string, expiryDate: string): Promise<any> {
    return this.get(`/historical/contracts?exchange=${exchange}&underlying_symbol=${underlyingSymbol}&expiry_date=${expiryDate}`);
  }

  async getHistoricalCandles(params: {
    exchange: string;
    segment: string;
    groww_symbol: string;
    start_time: string;
    end_time: string;
    candle_interval: string; // Valid: '1minute', '5minute', '15minute', '1day'
  }): Promise<any> {
    // Groww API expects groww_symbol in format: NSE-RELIANCE (exchange-tradingSymbol with hyphen)
    const growwSymbol = this.formatGrowwSymbol(params.exchange, params.groww_symbol);
    const qp = new URLSearchParams({
      exchange: params.exchange,
      segment: params.segment,
      groww_symbol: growwSymbol,
      start_time: params.start_time,
      end_time: params.end_time,
      candle_interval: params.candle_interval,
    });
    return this.get(`/historical/candles?${qp.toString()}`);
  }

  // ─── Connection Test ───────────────────────────────────

  async testConnection(): Promise<GrowwConnectionStatus> {
    try {
      if (!this.accessToken) {
        return { connected: false, accessTokenValid: false, error: 'No access token' };
      }

      const profile = await this.getUserProfile();
      let margin: GrowwConnectionStatus['margin'] | undefined;

      try {
        const marginData = await this.getAvailableMargin();
        margin = {
          clearCash: marginData.clear_cash || marginData.clearCash || 0,
          netMarginUsed: marginData.net_margin_used || marginData.netMarginUsed || 0,
          collateralAvailable: marginData.collateral_available || marginData.collateralAvailable || 0,
        };
      } catch {
        // Margin might fail if market is closed, that's OK
      }

      return {
        connected: true,
        accessTokenValid: true,
        profile: {
          vendorUserId: profile.vendor_user_id || profile.vendorUserId || '',
          ucc: profile.ucc || '',
          nseEnabled: profile.nse_enabled ?? profile.nseEnabled ?? true,
          bseEnabled: profile.bse_enabled ?? profile.bseEnabled ?? true,
          activeSegments: profile.active_segments || profile.activeSegments || [],
        },
        margin: margin || undefined,
      };
    } catch (error: any) {
      return {
        connected: false,
        accessTokenValid: false,
        error: error.message,
      };
    }
  }

  // ─── Private Symbol Formatting Methods ─────────────────

  /**
   * Format exchange trading symbol for LTP/OHLC APIs
   * Input: "NSE:RELIANCE" or "RELIANCE" → Output: "NSE_RELIANCE"
   */
  private formatExchangeSymbol(symbol: string): string {
    // If already in NSE_RELIANCE format, return as-is
    if (symbol.includes('_') && !symbol.includes(':')) return symbol;
    // Convert NSE:RELIANCE → NSE_RELIANCE
    if (symbol.includes(':')) return symbol.replace(':', '_');
    // If just trading symbol, prepend NSE_ (default exchange)
    return `NSE_${symbol}`;
  }

  /**
   * Format groww_symbol for historical candles API
   * Input: exchange + tradingSymbol → Output: "NSE-RELIANCE"
   */
  private formatGrowwSymbol(exchange: string, tradingSymbol: string): string {
    // If already in NSE-RELIANCE format, return as-is
    if (tradingSymbol.includes('-') && !tradingSymbol.includes(':')) return tradingSymbol;
    // Convert NSE:RELIANCE → NSE-RELIANCE
    if (tradingSymbol.includes(':')) return tradingSymbol.replace(':', '-');
    // Combine exchange and trading symbol
    return `${exchange}-${tradingSymbol}`;
  }

  // ─── Private HTTP Methods ──────────────────────────────

  private async get(path: string): Promise<any> {
    if (!this.accessToken) {
      throw new Error('No access token. Call generateAccessToken() first.');
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(this.accessToken),
    });

    return parseResponse(response);
  }

  private async post(path: string, body: any): Promise<any> {
    if (!this.accessToken) {
      throw new Error('No access token. Call generateAccessToken() first.');
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(this.accessToken),
      body: JSON.stringify(body),
    });

    return parseResponse(response);
  }
}

// ─── Singleton Manager ──────────────────────────────────

let growwClientInstance: GrowwClient | null = null;
let clientConfig: GrowwAuthConfig | null = null;

/**
 * Initialize or get the Groww client singleton
 */
export function getGrowwClient(config?: GrowwAuthConfig): GrowwClient {
  if (config) {
    clientConfig = config;
    growwClientInstance = new GrowwClient(config);
  }
  if (!growwClientInstance && clientConfig) {
    growwClientInstance = new GrowwClient(clientConfig);
  }
  if (!growwClientInstance) {
    throw new Error('Groww client not initialized. Call getGrowwClient(config) first.');
  }
  return growwClientInstance;
}

/**
 * Reset the Groww client singleton (on disconnect)
 */
export function resetGrowwClient(): void {
  growwClientInstance = null;
  clientConfig = null;
}

/**
 * Check if Groww client is initialized
 */
export function isGrowwClientInitialized(): boolean {
  return growwClientInstance !== null && !!clientConfig?.accessToken;
}

// ─── Signal-to-Order Converter ──────────────────────────

export interface SignalOrderParams {
  tradingSymbol: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  orderType?: string;
  price?: number;
  triggerPrice?: number;
  segment?: string;
  product?: string;
  exchange?: string;
}

/**
 * Convert a TradeSignal to Groww order parameters
 * Handles option symbols like "NIFTY 24000 CE" → trading_symbol format
 */
export function signalToGrowwOrder(signal: {
  symbol: string;
  action: string;
  entryPrice: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  quantity?: number;
}): SignalOrderParams & { targetPrice?: number; stopLoss?: number; smartOrderType?: string } {
  const tradingSymbol = convertSymbolToGrowwFormat(signal.symbol);
  const transactionType = signal.action.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  const isOption = tradingSymbol.includes('CE') || tradingSymbol.includes('PE');
  const isFuture = tradingSymbol.endsWith('FUT');
  const segment = (isOption || isFuture) ? GROWW_CONSTANTS.SEGMENT_FNO : GROWW_CONSTANTS.SEGMENT_CASH;
  const product = (isOption || isFuture) ? GROWW_CONSTANTS.PRODUCT_MIS : GROWW_CONSTANTS.PRODUCT_MIS;

  // For options with target and SL, use SL-M order type
  const hasSL = !!signal.stopLoss;
  const orderType = signal.entryPrice > 0
    ? (hasSL ? GROWW_CONSTANTS.ORDER_TYPE_SL : GROWW_CONSTANTS.ORDER_TYPE_LIMIT)
    : GROWW_CONSTANTS.ORDER_TYPE_MARKET;

  const result: SignalOrderParams & { targetPrice?: number; stopLoss?: number; smartOrderType?: string } = {
    tradingSymbol,
    transactionType: transactionType as 'BUY' | 'SELL',
    quantity: signal.quantity || 1,
    orderType,
    price: signal.entryPrice > 0 ? signal.entryPrice : undefined,
    triggerPrice: signal.stopLoss || undefined,
    segment,
    product,
    exchange: GROWW_CONSTANTS.EXCHANGE_NSE,
    targetPrice: signal.targetPrice || undefined,
    stopLoss: signal.stopLoss || undefined,
  };

  // If we have both target and SL, suggest OCO smart order
  if (signal.targetPrice && signal.stopLoss && (isOption || isFuture)) {
    result.smartOrderType = GROWW_CONSTANTS.SMART_ORDER_TYPE_OCO;
  }

  return result;
}

/**
 * Convert signal symbol to Groww trading symbol format
 * Examples:
 *   "RELIANCE" → "RELIANCE"
 *   "NIFTY 24000 CE" → "NIFTY24000CE" (approximate, needs expiry)
 *   "BANKNIFTY 50000 PE" → "BANKNIFTY50000PE"
 */
function convertSymbolToGrowwFormat(symbol: string): string {
  // Remove spaces for options/futures
  let cleaned = symbol.toUpperCase().trim();

  // Check if it looks like an option: contains CE/PE
  if (cleaned.includes(' CE') || cleaned.includes(' PE')) {
    cleaned = cleaned.replace(/\s+/g, '');
  }

  // Check if it looks like a future: ends with FUT
  if (cleaned.includes(' FUT') || cleaned.endsWith('FUT')) {
    cleaned = cleaned.replace(/\s+/g, '');
  }

  return cleaned;
}
