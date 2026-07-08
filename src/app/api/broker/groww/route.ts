// ============================================================
// Groww Broker API Route
// Handles all Groww Trading API operations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  GrowwClient,
  getGrowwClient,
  resetGrowwClient,
  GROWW_CONSTANTS,
  signalToGrowwOrder,
  type GrowwAuthConfig,
} from '@/lib/broker/groww-client';

// ─── Helper: Get active Groww credentials from DB ─────────

async function getGrowwCredentials(): Promise<{
  config: GrowwAuthConfig;
  credential: any;
} | null> {
  const credential = await db.brokerCredential.findFirst({
    where: { broker: 'groww', isActive: true },
  });

  if (!credential) return null;

  return {
    config: {
      apiKey: credential.apiKey,
      apiSecret: credential.apiSecret || undefined,
      totpSecret: credential.totpSecret || undefined,
      authMethod: credential.authMethod as 'approval' | 'totp',
      accessToken: credential.accessToken || undefined,
    },
    credential,
  };
}

// ─── Helper: Get or create client from DB ─────────────────

async function getClient(): Promise<{ client: GrowwClient; credential: any } | null> {
  const creds = await getGrowwCredentials();
  if (!creds) return null;

  const client = getGrowwClient(creds.config);
  return { client, credential: creds.credential };
}

// ─── Helper: Update credential in DB ──────────────────────

async function updateCredential(id: string, data: any): Promise<void> {
  await db.brokerCredential.update({
    where: { id },
    data,
  });
}

// ─── GET: Status / Profile / Positions / Orders ───────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'status': {
        const creds = await getGrowwCredentials();
        if (!creds) {
          return NextResponse.json({
            connected: false,
            hasCredentials: false,
            error: 'No Groww credentials found',
          });
        }

        // Try to test the connection
        try {
          const client = getGrowwClient(creds.config);
          if (!creds.config.accessToken) {
            return NextResponse.json({
              connected: false,
              hasCredentials: true,
              error: 'Access token not generated yet',
              hint: 'Go to Setup → Groww Connection → Generate / Refresh Token to create a new access token.',
              authMethod: creds.config.authMethod,
            });
          }

          const status = await client.testConnection();

          // If connection test returned an auth-related error, add a helpful hint
          let hint: string | undefined;
          const errMsg = status.error || '';
          if (errMsg.includes('IP_NOT_REGISTERED')) {
            hint = 'Your server IP is not registered in the Groww API dashboard. Go to Groww API Keys page → Registered IPs → Add your server IP, then regenerate the access token.';
          } else if (errMsg.includes('AUTHORISATION_FAILED') || errMsg.includes('Access denied')) {
            hint = 'Groww returned 403 (Access denied). This usually means your server IP is not registered or the access token was generated before IP registration. Go to Groww API Keys page → Registered IPs → Add your server IP → Click Approve → Then click "Regenerate Token" below.';
          } else if (errMsg.includes('AUTHENTICATION_FAILED') || errMsg.includes('GA005')) {
            hint = 'Your access token is invalid or expired. This often happens when the IP was registered after the token was generated. Click "Regenerate Token" below to create a new one.';
          }

          return NextResponse.json({
            connected: status.connected,
            hasCredentials: true,
            accessTokenValid: status.accessTokenValid,
            profile: status.profile,
            margin: status.margin,
            error: status.error,
            hint,
            authMethod: creds.config.authMethod,
          });
        } catch (error: any) {
          const errMsg = error.message || '';
          let hint: string | undefined;
          if (errMsg.includes('IP_NOT_REGISTERED')) {
            hint = 'Your server IP is not registered in the Groww API dashboard. Go to Groww API Keys page → Registered IPs → Add your server IP, then regenerate the access token.';
          } else if (errMsg.includes('AUTHORISATION_FAILED') || errMsg.includes('Access denied')) {
            hint = 'Groww returned 403 (Access denied). This usually means your server IP is not registered or the access token was generated before IP registration. Register the IP and click "Regenerate Token" in Setup.';
          } else if (errMsg.includes('AUTHENTICATION_FAILED') || errMsg.includes('GA005')) {
            hint = 'Your access token is invalid or expired. This often happens when the IP was registered after the token was generated. Click "Regenerate Token" to create a new one.';
          }

          return NextResponse.json({
            connected: false,
            hasCredentials: true,
            error: errMsg,
            hint,
            authMethod: creds.config.authMethod,
          });
        }
      }

      case 'profile': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const profile = await result.client.getUserProfile();
        return NextResponse.json({ profile });
      }

      case 'positions': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const segment = searchParams.get('segment') || undefined;
        const positions = await result.client.getPositions(segment);
        return NextResponse.json({ positions });
      }

      case 'holdings': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const holdings = await result.client.getHoldings();
        return NextResponse.json({ holdings });
      }

      case 'margin': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const margin = await result.client.getAvailableMargin();
        return NextResponse.json({ margin });
      }

      case 'orders': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const segment = searchParams.get('segment') || undefined;
        const page = parseInt(searchParams.get('page') || '0');
        const pageSize = parseInt(searchParams.get('page_size') || '50');
        const orders = await result.client.getOrderList({ segment: segment || undefined, page, page_size: pageSize });
        return NextResponse.json({ orders });
      }

      case 'order-status': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const orderId = searchParams.get('groww_order_id');
        const segment = searchParams.get('segment') || 'CASH';
        if (!orderId) return NextResponse.json({ error: 'groww_order_id is required' }, { status: 400 });
        const status = await result.client.getOrderStatus(orderId, segment);
        return NextResponse.json({ status });
      }

      case 'ltp': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const symbols = searchParams.get('symbols') || '';
        const segment = searchParams.get('segment') || 'CASH';
        const symbolList = symbols
          .split(',')
          .map((symbol) => symbol.trim())
          .filter(Boolean);
        const ltp = await result.client.getLTP(symbolList.length > 1 ? symbolList : symbols, segment);
        return NextResponse.json({ ltp });
      }

      case 'quote': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const tradingSymbol = searchParams.get('trading_symbol');
        const exchange = searchParams.get('exchange') || 'NSE';
        const segment = searchParams.get('segment') || 'CASH';
        if (!tradingSymbol) return NextResponse.json({ error: 'trading_symbol is required' }, { status: 400 });
        const quote = await result.client.getQuote(tradingSymbol, exchange, segment);
        return NextResponse.json({ quote });
      }

      case 'option-chain': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        const exchange = searchParams.get('exchange') || 'NSE';
        const underlying = searchParams.get('underlying');
        const expiryDate = searchParams.get('expiry_date') || undefined;
        if (!underlying) return NextResponse.json({ error: 'underlying is required' }, { status: 400 });
        const chain = await result.client.getOptionChain(exchange, underlying, expiryDate);
        return NextResponse.json({ optionChain: chain });
      }

      case 'broker-orders': {
        // Get broker orders from our DB
        const brokerOrders = await db.brokerOrder.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { signal: true },
        });
        return NextResponse.json({ orders: brokerOrders });
      }

      case 'credentials': {
        const credential = await db.brokerCredential.findFirst({
          where: { broker: 'groww', isActive: true },
        });
        if (!credential) {
          return NextResponse.json({ hasCredentials: false });
        }
        return NextResponse.json({
          hasCredentials: true,
          authMethod: credential.authMethod,
          userId: credential.userId,
          userName: credential.userName,
          lastVerified: credential.lastVerified,
          // Don't expose secrets
          apiKeyPreview: credential.apiKey ? `${credential.apiKey.substring(0, 4)}****` : null,
        });
      }

      case 'server-ip': {
        // Return the server's public IP so users can register it in Groww API dashboard
        try {
          const ipRes = await fetch('https://ifconfig.me', {
            headers: { 'User-Agent': 'curl/7.88.1' },
            signal: AbortSignal.timeout(5000),
          });
          const ip = (await ipRes.text()).trim();
          return NextResponse.json({ ip });
        } catch {
          return NextResponse.json({ ip: 'unknown', hint: 'Could not detect server IP. Check your server IP manually.' });
        }
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[GrowwAPI] GET error:', error);
    return NextResponse.json({
      error: error.message,
      connected: false,
    }, { status: 500 });
  }
}

// ─── POST: Auth / Orders / Smart Orders ───────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ─── Authentication ────────────────────────────────
      case 'save-credentials': {
        const { apiKey, apiSecret, authMethod, totpSecret } = body;

        if (!apiKey) {
          return NextResponse.json({ error: 'API Key is required' }, { status: 400 });
        }

        // For approval flow, API Secret is required
        if (authMethod === 'approval' && !apiSecret) {
          return NextResponse.json({ error: 'API Secret is required for approval flow' }, { status: 400 });
        }

        // For TOTP flow, TOTP Secret is required
        if (authMethod === 'totp' && !totpSecret) {
          return NextResponse.json({ error: 'TOTP Secret is required for TOTP flow' }, { status: 400 });
        }

        // Deactivate existing credentials
        await db.brokerCredential.updateMany({
          where: { broker: 'groww', isActive: true },
          data: { isActive: false },
        });

        // Create new credential
        const credential = await db.brokerCredential.create({
          data: {
            broker: 'groww',
            apiKey,
            apiSecret: apiSecret || null,
            authMethod: authMethod || 'approval',
            totpSecret: totpSecret || null,
            isActive: true,
          },
        });

        // Initialize client
        const config: GrowwAuthConfig = {
          apiKey,
          apiSecret: apiSecret || undefined,
          totpSecret: totpSecret || undefined,
          authMethod: authMethod || 'approval',
        };
        const client = getGrowwClient(config);

        // For approval flow: auto-generate access token from server
        // This ensures the server's IP is included in the token
        if (authMethod === 'approval' && apiSecret) {
          try {
            const accessToken = await client.generateAccessToken();

            // Save access token to DB
            await db.brokerCredential.update({
              where: { id: credential.id },
              data: { accessToken, lastVerified: new Date() },
            });

            // Update client config with token
            config.accessToken = accessToken;

            // Test connection to get profile
            const status = await client.testConnection();

            if (status.profile) {
              await db.brokerCredential.update({
                where: { id: credential.id },
                data: {
                  userId: status.profile.vendorUserId,
                  userName: status.profile.ucc,
                },
              });
            }

            return NextResponse.json({
              success: true,
              credentialId: credential.id,
              autoConnected: true,
              profile: status.profile,
              margin: status.margin,
              message: 'Credentials saved and access token generated automatically from server',
            });
          } catch (tokenError: any) {
            // Token generation failed (e.g., not approved yet on Groww dashboard)
            return NextResponse.json({
              success: true,
              credentialId: credential.id,
              autoConnected: false,
              tokenError: tokenError.message,
              message: 'Credentials saved, but auto token generation failed. Make sure you click "Approve" on the Groww API Keys page, then click "Generate Access Token" below.',
            });
          }
        }

        return NextResponse.json({
          success: true,
          credentialId: credential.id,
          autoConnected: false,
          message: 'Credentials saved successfully',
        });
      }

      case 'save-direct-token': {
        // Direct access token flow: user pastes the token from Groww dashboard
        const { accessToken } = body;

        if (!accessToken) {
          return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
        }

        // Deactivate existing credentials
        await db.brokerCredential.updateMany({
          where: { broker: 'groww', isActive: true },
          data: { isActive: false },
        });

        // Create a credential entry for direct token flow
        const credential = await db.brokerCredential.create({
          data: {
            broker: 'groww',
            apiKey: `direct-${Date.now()}`,
            apiSecret: null,
            authMethod: 'direct',
            totpSecret: null,
            accessToken,
            isActive: true,
            lastVerified: new Date(),
          },
        });

        // Initialize client with the direct access token
        const config: GrowwAuthConfig = {
          apiKey: credential.apiKey,
          authMethod: 'direct',
          accessToken,
        };
        const client = getGrowwClient(config);

        // Test connection to verify the token works and get profile
        try {
          const status = await client.testConnection();

          if (status.profile) {
            await updateCredential(credential.id, {
              userId: status.profile.vendorUserId,
              userName: status.profile.ucc,
            });
          }

          return NextResponse.json({
            success: true,
            profile: status.profile,
            margin: status.margin,
          });
        } catch (error: any) {
          // Token might still be valid even if profile fails
          return NextResponse.json({
            success: true,
            warning: `Token saved but profile check failed: ${error.message}`,
          });
        }
      }

      case 'generate-token': {
        const creds = await getGrowwCredentials();
        if (!creds) {
          return NextResponse.json({ error: 'No credentials found. Save credentials first.' }, { status: 400 });
        }

        const client = getGrowwClient(creds.config);

        try {
          const accessToken = await client.generateAccessToken(body.totp_code);

          // Save access token to DB
          await updateCredential(creds.credential.id, {
            accessToken,
            lastVerified: new Date(),
          });

          // Update client config
          creds.config.accessToken = accessToken;

          // Test connection to get profile
          const status = await client.testConnection();

          if (status.profile) {
            await updateCredential(creds.credential.id, {
              userId: status.profile.vendorUserId,
              userName: status.profile.ucc,
            });
          }

          return NextResponse.json({
            success: true,
            accessToken: accessToken.substring(0, 8) + '****',
            profile: status.profile,
            margin: status.margin,
          });
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            error: error.message,
          }, { status: 400 });
        }
      }

      case 'test-connection': {
        const creds = await getGrowwCredentials();
        if (!creds) {
          return NextResponse.json({ connected: false, error: 'No credentials' });
        }

        const client = getGrowwClient(creds.config);
        const status = await client.testConnection();
        return NextResponse.json(status);
      }

      case 'disconnect': {
        // Deactivate credentials
        await db.brokerCredential.updateMany({
          where: { broker: 'groww', isActive: true },
          data: {
            isActive: false,
            accessToken: null,
          },
        });
        resetGrowwClient();
        return NextResponse.json({ success: true });
      }

      // ─── Order Operations ─────────────────────────────
      case 'place-order': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

        const { signalId, ...orderParams } = body;

        const orderResponse = await result.client.placeOrder(orderParams);

        // Save to DB
        const brokerOrder = await db.brokerOrder.create({
          data: {
            broker: 'groww',
            growwOrderId: orderResponse.groww_order_id,
            orderRefId: orderResponse.order_reference_id,
            signalId: signalId || null,
            tradingSymbol: orderParams.trading_symbol,
            exchange: orderParams.exchange || 'NSE',
            segment: orderParams.segment || 'CASH',
            product: orderParams.product || 'MIS',
            orderType: orderParams.order_type || 'MARKET',
            transactionType: orderParams.transaction_type,
            quantity: orderParams.quantity,
            price: orderParams.price || null,
            triggerPrice: orderParams.trigger_price || null,
            status: 'submitted',
            remark: orderResponse.remark,
          },
        });

        // Update signal status if linked
        if (signalId) {
          await db.tradeSignal.update({
            where: { id: signalId },
            data: { status: 'executed' },
          });
        }

        return NextResponse.json({
          success: true,
          order: brokerOrder,
          growwResponse: orderResponse,
        });
      }

      case 'execute-signal': {
        // Execute a trade signal through Groww
        const result = await getClient();
        if (!result) return NextResponse.json({
          success: false,
          error: 'Not connected',
          hint: 'Connect your Groww account in Setup before executing trades',
        }, { status: 400 });

        const { signalId } = body;
        if (!signalId) return NextResponse.json({ success: false, error: 'signalId is required' }, { status: 400 });

        const signal = await db.tradeSignal.findUnique({ where: { id: signalId } });
        if (!signal) return NextResponse.json({ success: false, error: 'Signal not found' }, { status: 404 });

        if (signal.status === 'executed') {
          return NextResponse.json({ success: false, error: 'Signal already executed' }, { status: 400 });
        }

        // Convert signal to Groww order params
        const orderParams = signalToGrowwOrder({
          symbol: signal.symbol,
          action: signal.action,
          entryPrice: signal.entryPrice,
          targetPrice: signal.targetPrice,
          stopLoss: signal.stopLoss,
          quantity: signal.quantity,
        });

        // Place the order
        try {
          const orderResponse = await result.client.placeOrder({
            trading_symbol: orderParams.tradingSymbol,
            transaction_type: orderParams.transactionType,
            quantity: orderParams.quantity,
            order_type: orderParams.orderType,
            price: orderParams.price,
            trigger_price: orderParams.triggerPrice,
            segment: orderParams.segment,
            product: orderParams.product,
            exchange: orderParams.exchange,
          });

          // Save to DB
          const brokerOrder = await db.brokerOrder.create({
            data: {
              broker: 'groww',
              growwOrderId: orderResponse.groww_order_id,
              orderRefId: orderResponse.order_reference_id,
              signalId: signal.id,
              tradingSymbol: orderParams.tradingSymbol,
              exchange: orderParams.exchange,
              segment: orderParams.segment,
              product: orderParams.product,
              orderType: orderParams.orderType,
              transactionType: orderParams.transactionType,
              quantity: orderParams.quantity,
              price: orderParams.price || null,
              triggerPrice: orderParams.triggerPrice || null,
              status: 'submitted',
              remark: orderResponse.remark,
            },
          });

          // If signal has target and SL, create OCO smart order for exit
          const targetPrice = orderParams.targetPrice ?? signal.targetPrice;
          const stopLoss = orderParams.stopLoss ?? signal.stopLoss;
          if (
            orderParams.smartOrderType &&
            orderResponse.groww_order_id &&
            orderParams.segment &&
            orderParams.product &&
            orderParams.exchange &&
            Number.isFinite(targetPrice) &&
            Number.isFinite(stopLoss)
          ) {
            try {
              const isBuy = signal.action.toUpperCase() === 'BUY';
              const ocoResponse = await result.client.createSmartOrder({
                smart_order_type: GROWW_CONSTANTS.SMART_ORDER_TYPE_OCO,
                reference_id: `OCO-${signal.id.substring(0, 8)}`,
                segment: orderParams.segment,
                trading_symbol: orderParams.tradingSymbol,
                quantity: orderParams.quantity,
                product_type: orderParams.product,
                exchange: orderParams.exchange,
                duration: GROWW_CONSTANTS.VALIDITY_DAY,
                transaction_type: isBuy ? GROWW_CONSTANTS.TRANSACTION_TYPE_SELL : GROWW_CONSTANTS.TRANSACTION_TYPE_BUY,
                net_position_quantity: orderParams.quantity,
                target: {
                  trigger_price: String(targetPrice),
                  order_type: GROWW_CONSTANTS.ORDER_TYPE_LIMIT,
                  price: String(targetPrice),
                },
                stop_loss: {
                  trigger_price: String(stopLoss),
                  order_type: GROWW_CONSTANTS.ORDER_TYPE_SL_M,
                  price: null,
                },
              });

              // Update broker order with OCO info
              await db.brokerOrder.update({
                where: { id: brokerOrder.id },
                data: {
                  remark: `Entry: ${orderResponse.groww_order_id} | OCO: ${ocoResponse.smart_order_id}`,
                },
              });
            } catch (ocoError: any) {
              console.error('[GrowwAPI] OCO order failed:', ocoError.message);
              // Don't fail the main order if OCO fails
            }
          }

          // Update signal status
          await db.tradeSignal.update({
            where: { id: signal.id },
            data: { status: 'executed' },
          });

          return NextResponse.json({
            success: true,
            order: brokerOrder,
            growwResponse: orderResponse,
            orderParams,
          });
        } catch (orderError: any) {
          const errorMsg = orderError.message || 'Unknown error';

          // Handle specific Groww API errors with helpful hints
          if (errorMsg.includes('IP_NOT_REGISTERED')) {
            return NextResponse.json({
              success: false,
              error: 'IP_NOT_REGISTERED',
              hint: 'Your server IP address is not registered in the Groww API dashboard. Go to Groww API Keys page → Registered IPs → Add your server IP, then regenerate the access token.',
            }, { status: 403 });
          }

          if (errorMsg.includes('AUTHORISATION_FAILED') || errorMsg.includes('Access denied')) {
            return NextResponse.json({
              success: false,
              error: 'AUTHORISATION_FAILED',
              hint: 'Groww returned 403 (Access denied). This usually means your server IP is not registered in the Groww API dashboard. Go to Groww API Keys page → Registered IPs → Add your server IP, then regenerate the access token.',
            }, { status: 403 });
          }

          if (errorMsg.includes('AUTHENTICATION_FAILED') || errorMsg.includes('GA005')) {
            return NextResponse.json({
              success: false,
              error: 'AUTHENTICATION_FAILED',
              hint: 'Your access token is invalid or expired. Go to Setup → Generate a new access token.',
            }, { status: 401 });
          }

          if (errorMsg.includes('INSUFFICIENT_MARGIN') || errorMsg.includes('margin')) {
            return NextResponse.json({
              success: false,
              error: 'INSUFFICIENT_MARGIN',
              hint: 'Insufficient margin in your Groww account for this trade. Add funds or reduce the quantity.',
            }, { status: 400 });
          }

          return NextResponse.json({
            success: false,
            error: errorMsg,
          }, { status: 500 });
        }
      }

      case 'cancel-order': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

        const { groww_order_id, segment, brokerOrderId } = body;
        const cancelResponse = await result.client.cancelOrder({
          groww_order_id,
          segment: segment || 'CASH',
        });

        // Update DB
        if (brokerOrderId) {
          await db.brokerOrder.update({
            where: { id: brokerOrderId },
            data: { status: 'cancelled', remark: 'Cancelled by user' },
          });
        }

        return NextResponse.json({ success: true, response: cancelResponse });
      }

      case 'modify-order': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

        const modifyResponse = await result.client.modifyOrder(body);
        return NextResponse.json({ success: true, response: modifyResponse });
      }

      // ─── Smart Orders ─────────────────────────────────
      case 'create-smart-order': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

        const smartResponse = await result.client.createSmartOrder(body);
        return NextResponse.json({ success: true, response: smartResponse });
      }

      case 'cancel-smart-order': {
        const result = await getClient();
        if (!result) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

        const { segment, smart_order_type, smart_order_id } = body;
        const cancelResponse = await result.client.cancelSmartOrder(segment, smart_order_type, smart_order_id);
        return NextResponse.json({ success: true, response: cancelResponse });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[GrowwAPI] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
