import type { TradeType } from '@/lib/trade-classification';

export type TradeQualityInput = {
  symbol: string;
  action: 'BUY' | 'SELL';
  confidence: number;
  entryPrice: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  tradeType?: TradeType | string | null;
  source?: string | null;
  sourceTimestamp?: Date | string | null;
  text?: string | null;
  trustedSource?: boolean;
};

export type TradeQualityResult = {
  accepted: boolean;
  score: number;
  rewardRisk: number | null;
  riskPct: number | null;
  rewardPct: number | null;
  reasons: string[];
};

function minutesOld(value?: Date | string | number | null): number | null {
  if (!value) return null;
  const normalizedValue = typeof value === 'string' && /^\d+$/.test(value) ? parseInt(value, 10) : value;
  const date = normalizedValue instanceof Date ? normalizedValue : new Date(normalizedValue);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / 60_000;
}

function getLimits(tradeType?: string | null): { minRewardRisk: number; maxRiskPct: number; maxAgeMinutes: number; minConfidence: number } {
  switch ((tradeType || '').toUpperCase()) {
    case 'SCALP':
      return { minRewardRisk: 1.4, maxRiskPct: 1.5, maxAgeMinutes: 45, minConfidence: 68 };
    case 'INTRADAY':
      return { minRewardRisk: 1.6, maxRiskPct: 3, maxAgeMinutes: 180, minConfidence: 68 };
    case 'F&O':
      return { minRewardRisk: 1.5, maxRiskPct: 25, maxAgeMinutes: 180, minConfidence: 65 };
    case 'BTST':
      return { minRewardRisk: 1.7, maxRiskPct: 4, maxAgeMinutes: 420, minConfidence: 66 };
    case 'DELIVERY':
    case 'POSITIONAL':
    case 'SWING':
      return { minRewardRisk: 1.8, maxRiskPct: 7, maxAgeMinutes: 72 * 60, minConfidence: 64 };
    default:
      return { minRewardRisk: 1.8, maxRiskPct: 5, maxAgeMinutes: 24 * 60, minConfidence: 66 };
  }
}

export function evaluateTradeQuality(input: TradeQualityInput): TradeQualityResult {
  const reasons: string[] = [];
  const entry = Number(input.entryPrice);
  const target = Number(input.targetPrice);
  const stop = Number(input.stopLoss);

  if (!Number.isFinite(entry) || entry <= 0) {
    return {
      accepted: false,
      score: 0,
      rewardRisk: null,
      riskPct: null,
      rewardPct: null,
      reasons: ['missingValidEntry'],
    };
  }

  const hasLevels = Number.isFinite(target) && target > 0 && Number.isFinite(stop) && stop > 0;
  let rewardRisk: number | null = null;
  let riskPct: number | null = null;
  let rewardPct: number | null = null;

  if (hasLevels) {
    const reward = input.action === 'BUY' ? target - entry : entry - target;
    const risk = input.action === 'BUY' ? entry - stop : stop - entry;
    if (reward <= 0 || risk <= 0) {
      return {
        accepted: false,
        score: 0,
        rewardRisk: null,
        riskPct: null,
        rewardPct: null,
        reasons: ['invalidDirectionalLevels'],
      };
    }

    rewardRisk = reward / risk;
    riskPct = (risk / entry) * 100;
    rewardPct = (reward / entry) * 100;
  }
  const limits = getLimits(input.tradeType);
  const age = minutesOld(input.sourceTimestamp);
  const text = input.text || '';

  let score = input.confidence;
  if (rewardRisk !== null) {
    score += Math.min(12, Math.max(0, rewardRisk - limits.minRewardRisk) * 7);
  }
  if (input.trustedSource) {
    score += 4;
    reasons.push('trustedSource');
  }
  if (age !== null) {
    if (age <= 30) score += 5;
    else if (age <= limits.maxAgeMinutes) score += 2;
    else {
      score -= 18;
      reasons.push('staleSource');
    }
  }
  if (/breakout|retest|volume|support|resistance|result|earnings|delivery buying|open interest|\boi\b|vwap/i.test(text)) {
    score += 4;
    reasons.push('hasMarketStructure');
  }
  if (/sure shot|guaranteed|jackpot|operator|insider|upper circuit|double money|multibagger|no loss/i.test(text)) {
    score -= 18;
    reasons.push('hypePenalty');
  }
  if (rewardRisk !== null && rewardRisk < limits.minRewardRisk) reasons.push(`rrBelow${limits.minRewardRisk}`);
  if (riskPct !== null && riskPct > limits.maxRiskPct) reasons.push(`riskAbove${limits.maxRiskPct}%`);
  if (input.confidence < limits.minConfidence) reasons.push(`confidenceBelow${limits.minConfidence}`);

  const finalScore = Math.max(0, Math.min(95, Math.round(score)));
  const accepted =
    finalScore >= limits.minConfidence &&
    (rewardRisk === null || rewardRisk >= limits.minRewardRisk) &&
    (riskPct === null || riskPct <= limits.maxRiskPct) &&
    (age === null || age <= limits.maxAgeMinutes);

  if (accepted) reasons.push('qualityAccepted');

  return {
    accepted,
    score: finalScore,
    rewardRisk: rewardRisk !== null ? Math.round(rewardRisk * 100) / 100 : null,
    riskPct: riskPct !== null ? Math.round(riskPct * 10) / 10 : null,
    rewardPct: rewardPct !== null ? Math.round(rewardPct * 10) / 10 : null,
    reasons,
  };
}

export function formatTradeQualityReason(result: TradeQualityResult): string {
  const rr = result.rewardRisk === null ? 'n/a' : result.rewardRisk.toFixed(2);
  const risk = result.riskPct === null ? 'n/a' : `${result.riskPct}%`;
  const reward = result.rewardPct === null ? 'n/a' : `${result.rewardPct}%`;
  return `QualityGate score=${result.score}/100 R:R=${rr} risk=${risk} reward=${reward} reasons=${result.reasons.join(',')}`;
}
