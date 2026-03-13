import type { Trade, SystemStats } from "../../types/store"

function consecutiveRuns(values: boolean[]): { maxTrue: number; maxFalse: number } {
  let maxTrue = 0, maxFalse = 0, curTrue = 0, curFalse = 0
  for (const v of values) {
    if (v) { curTrue++; curFalse = 0; maxTrue  = Math.max(maxTrue,  curTrue)  }
    else   { curFalse++; curTrue = 0; maxFalse = Math.max(maxFalse, curFalse) }
  }
  return { maxTrue, maxFalse }
}

/**
 * @param curve equity values (cumulative P&L, starting from 0)
 * @param initialCapital base capital used for % calculation (e.g. first entry price)
 */
function maxDrawdownFromEquity(curve: number[], initialCapital: number): { absolute: number; percent: number } {
  let peak = curve[0] ?? 0, maxAbs = 0, maxPct = 0
  for (const v of curve) {
    if (v > peak) peak = v
    const dd = peak - v
    if (dd > maxAbs) {
      maxAbs = dd
      const base = initialCapital + peak
      maxPct = base > 0 ? (dd / base) * 100 : 0
    }
  }
  return { absolute: maxAbs, percent: maxPct }
}

function sharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0
  const mean     = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
  const std = Math.sqrt(variance)
  return std === 0 ? 0 : +(mean / std).toFixed(4)
}

function sortinoRatio(returns: number[]): number {
  if (returns.length < 2) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const negReturns = returns.filter(r => r < 0)
  if (!negReturns.length) return mean > 0 ? Infinity : 0
  const downVariance = negReturns.reduce((s, r) => s + r ** 2, 0) / returns.length
  const downStd = Math.sqrt(downVariance)
  return downStd === 0 ? 0 : +(mean / downStd).toFixed(4)
}

export function computeSystemStats(trades: Trade[]): SystemStats {
  const closed = trades.filter(t => t.exitTime != null && t.pnl != null)
  const pnls    = closed.map(t => t.pnl!)
  const pnlPcts = closed.map(t => t.pnlPercent!)
  const wins    = pnls.filter(p => p > 0)
  const losses  = pnls.filter(p => p <= 0)

  const netProfit   = pnls.reduce((a, b) => a + b, 0)
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss   = Math.abs(losses.reduce((a, b) => a + b, 0))
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss

  const winRate   = closed.length ? (wins.length / closed.length) * 100 : 0
  const avgWin    = wins.length   ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss   = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0)) / losses.length : 0
  const avgWinPct = wins.length   ? pnlPcts.filter(p => p > 0).reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLossPct = losses.length ? Math.abs(pnlPcts.filter(p => p <= 0).reduce((a, b) => a + b, 0)) / losses.length : 0

  const lossRate  = 100 - winRate
  const expectancy = ((winRate / 100) * avgWin) - ((lossRate / 100) * avgLoss)

  const winFlags = closed.map(t => (t.pnl ?? 0) > 0)
  const { maxTrue: maxConsWins, maxFalse: maxConsLosses } = consecutiveRuns(winFlags)

  const equityCurve: Array<{ time: number; equity: number }> = []
  let equity = 0
  for (const t of closed) {
    equity += t.pnl!
    equityCurve.push({ time: t.exitTime!, equity })
  }

  const equityValues = [0, ...equityCurve.map(p => p.equity)]
  const initialCapital = closed.length > 0 ? closed[0].entryPrice : 0
  const { absolute: maxDrawdown, percent: maxDrawdownPercent } = maxDrawdownFromEquity(equityValues, initialCapital)
  const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : 0
  const closedWithBars = closed.filter(t => t.bars != null)
  const avgBars = closedWithBars.length
    ? closedWithBars.reduce((s, t) => s + t.bars!, 0) / closedWithBars.length
    : 0

  return {
    totalTrades:          trades.length,
    winningTrades:        wins.length,
    losingTrades:         losses.length,
    winRate:              +winRate.toFixed(2),
    profitFactor:         +profitFactor.toFixed(4),
    netProfit:            +netProfit.toFixed(4),
    netProfitPercent:     +(initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0).toFixed(4),
    grossProfit:          +grossProfit.toFixed(4),
    grossLoss:            +grossLoss.toFixed(4),
    avgWin:               +avgWin.toFixed(4),
    avgLoss:              +avgLoss.toFixed(4),
    avgWinPercent:        +avgWinPct.toFixed(4),
    avgLossPercent:       +avgLossPct.toFixed(4),
    expectancy:           +expectancy.toFixed(4),
    maxConsecutiveWins:   maxConsWins,
    maxConsecutiveLosses: maxConsLosses,
    maxDrawdown:          +maxDrawdown.toFixed(4),
    maxDrawdownPercent:   +maxDrawdownPercent.toFixed(4),
    sharpeRatio:          sharpeRatio(pnlPcts),
    sortinoRatio:         sortinoRatio(pnlPcts),
    calmarRatio:          maxDrawdownPercent > 0
      ? +((initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0) / maxDrawdownPercent).toFixed(4)
      : 0,
    recoveryFactor:       +recoveryFactor.toFixed(4),
    avgBarsInTrade:       +avgBars.toFixed(1),
    bestTrade:            pnls.length ? +Math.max(...pnls).toFixed(4) : 0,
    worstTrade:           pnls.length ? +Math.min(...pnls).toFixed(4) : 0,
    equityCurve,
  }
}
