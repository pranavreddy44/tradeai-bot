import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/portfolio/summary - Calculate portfolio summary from positions
export async function GET() {
  try {
    // Get all positions
    const allPositions = await db.position.findMany();
    const openPositions = allPositions.filter((p) => p.status === 'open');
    const closedPositions = allPositions.filter((p) => p.status === 'closed');

    // Calculate totals for open positions
    const totalInvested = openPositions.reduce(
      (sum, p) => sum + p.entryPrice * p.quantity,
      0
    );

    const currentValue = openPositions.reduce(
      (sum, p) => sum + (p.currentPrice ?? p.entryPrice) * p.quantity,
      0
    );

    // Calculate P&L for open positions (unrealized)
    const unrealizedPnl = openPositions.reduce((sum, p) => {
      const pnl =
        p.action === 'BUY'
          ? ((p.currentPrice ?? p.entryPrice) - p.entryPrice) * p.quantity
          : (p.entryPrice - (p.currentPrice ?? p.entryPrice)) * p.quantity;
      return sum + pnl;
    }, 0);

    // Calculate P&L for closed positions (realized)
    const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);

    const totalPnl = unrealizedPnl + realizedPnl;

    // Win rate calculation
    const winningTrades = closedPositions.filter((p) => (p.pnl ?? 0) > 0).length;
    const losingTrades = closedPositions.filter((p) => (p.pnl ?? 0) < 0).length;
    const totalClosedTrades = closedPositions.length;
    const winRate = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0;

    // Average P&L per trade
    const avgPnlPerTrade = totalClosedTrades > 0 ? realizedPnl / totalClosedTrades : 0;

    // Best and worst trades
    const sortedClosed = [...closedPositions].sort(
      (a, b) => (b.pnl ?? 0) - (a.pnl ?? 0)
    );
    const bestTrade = sortedClosed.length > 0 ? sortedClosed[0] : null;
    const worstTrade = sortedClosed.length > 0 ? sortedClosed[sortedClosed.length - 1] : null;

    // Position distribution by symbol
    const symbolMap: Record<string, { invested: number; current: number; pnl: number; count: number }> = {};
    for (const pos of openPositions) {
      if (!symbolMap[pos.symbol]) {
        symbolMap[pos.symbol] = { invested: 0, current: 0, pnl: 0, count: 0 };
      }
      symbolMap[pos.symbol].invested += pos.entryPrice * pos.quantity;
      symbolMap[pos.symbol].current += (pos.currentPrice ?? pos.entryPrice) * pos.quantity;
      symbolMap[pos.symbol].pnl +=
        pos.action === 'BUY'
          ? ((pos.currentPrice ?? pos.entryPrice) - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - (pos.currentPrice ?? pos.entryPrice)) * pos.quantity;
      symbolMap[pos.symbol].count += 1;
    }

    // Signal stats
    const totalSignals = await db.tradeSignal.count();
    const pendingSignals = await db.tradeSignal.count({ where: { status: 'pending' } });
    const executedSignals = await db.tradeSignal.count({ where: { status: 'executed' } });
    const closedSignals = await db.tradeSignal.count({ where: { status: 'closed' } });

    // P&L percentage
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalInvested: Math.round(totalInvested * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        openPositions: openPositions.length,
        closedPositions: closedPositions.length,
        totalPositions: allPositions.length,
        winRate: Math.round(winRate * 100) / 100,
        winningTrades,
        losingTrades,
        avgPnlPerTrade: Math.round(avgPnlPerTrade * 100) / 100,
        bestTrade: bestTrade
          ? { symbol: bestTrade.symbol, pnl: bestTrade.pnl }
          : null,
        worstTrade: worstTrade
          ? { symbol: worstTrade.symbol, pnl: worstTrade.pnl }
          : null,
      },
      signals: {
        total: totalSignals,
        pending: pendingSignals,
        executed: executedSignals,
        closed: closedSignals,
      },
      positionsBySymbol: symbolMap,
    });
  } catch (error) {
    console.error('Error calculating portfolio summary:', error);
    return NextResponse.json(
      { error: 'Failed to calculate portfolio summary' },
      { status: 500 }
    );
  }
}
