import type { TradingSystem, Trade, SystemStats, DataTableRow, ConditionRule, TradeDirection } from "../types/store"

// ---------------------------------------------------------------------------
// Rule evaluation (reuses the same logic as condition_engine without the
// Condition wrapper — TradingSystem has bare ConditionRule objects).
// ---------------------------------------------------------------------------

function resolveColumnValue(row: DataTableRow, column: string): number | null {
  const v = row[column]
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function evaluateRule(
  rule: ConditionRule,
  row: DataTableRow,
  prevRow: DataTableRow | null,
): boolean {
  const colValue = resolveColumnValue(row, rule.column)
  if (colValue == null) return false
  const threshold = rule.value

  switch (rule.type) {
    case "value_gt":
    case "change_gt":
      return colValue > threshold
    case "value_lt":
    case "change_lt":
      return colValue < threshold
    case "between": {
      const upper = rule.compareColumn ? resolveColumnValue(row, rule.compareColumn) : threshold
      return upper != null && colValue >= threshold && colValue <= upper
    }
    case "cross_above": {
      if (!prevRow || !rule.compareColumn) return false
      const prevVal = resolveColumnValue(prevRow, rule.column)
      const curCmp  = resolveColumnValue(row, rule.compareColumn)
      const prevCmp = resolveColumnValue(prevRow, rule.compareColumn)
      if (prevVal == null || curCmp == null || prevCmp == null) return false
      return prevVal <= prevCmp && colValue > curCmp
    }
    case "cross_below": {
      if (!prevRow || !rule.compareColumn) return false
      const prevVal = resolveColumnValue(prevRow, rule.column)
      const curCmp  = resolveColumnValue(row, rule.compareColumn)
      const prevCmp = resolveColumnValue(prevRow, rule.compareColumn)
      if (prevVal == null || curCmp == null || prevCmp == null) return false
      return prevVal >= prevCmp && colValue < curCmp
    }
    case "expression":
      return false  // expression rules not supported in system engine
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Fill-price logic: determines the realistic execution price based on the
// condition type that triggered the signal, the direction, and slippage.
// ---------------------------------------------------------------------------

/**
 * For cross_above / cross_below the fill price is the compareColumn value on the
 * *previous* bar (the level we expected to cross) ± slippage.
 * For all other rule types the fill price is simply close ± slippage.
 */
function computeFillPrice(
  rule: ConditionRule,
  row: DataTableRow,
  prevRow: DataTableRow | null,
  direction: "buy" | "sell",
  slippage: number,
): number {
  const slip = direction === "buy" ? slippage : -slippage

  if ((rule.type === "cross_above" || rule.type === "cross_below") && rule.compareColumn && prevRow) {
    const level = resolveColumnValue(prevRow, rule.compareColumn)
    if (level != null) return level + slip
  }

  return row.close + slip
}

// ---------------------------------------------------------------------------
// Trade generation
// ---------------------------------------------------------------------------

type OpenPos = { time: number; price: number; barIndex: number }

/**
 * Generate completed and open trades from rows for a single system.
 * Long and short positions are tracked independently.
 * Position size = 1 unit.
 */
export function generateTrades(system: TradingSystem, rows: DataTableRow[]): Trade[] {
  if (!rows.length) return []

  const trades: Trade[] = []
  let openLong: OpenPos | null = null
  let openShort: OpenPos | null = null

  const hasLong  = !!(system.longEntryRule && system.longExitRule)
  const hasShort = !!(system.shortEntryRule && system.shortExitRule)
  const slippage = system.slippage ?? 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const prevRow = i > 0 ? rows[i - 1] : null

    if (hasLong) {
      if (!openLong && evaluateRule(system.longEntryRule!, row, prevRow)) {
        const price = computeFillPrice(system.longEntryRule!, row, prevRow, "buy", slippage)
        openLong = { time: row.time, price, barIndex: i }
      } else if (openLong && evaluateRule(system.longExitRule!, row, prevRow)) {
        const price = computeFillPrice(system.longExitRule!, row, prevRow, "sell", slippage)
        const pnl = price - openLong.price
        trades.push({
          entryTime: openLong.time, entryPrice: openLong.price,
          exitTime: row.time, exitPrice: price,
          direction: "long", pnl, pnlPercent: (pnl / openLong.price) * 100,
          bars: i - openLong.barIndex,
        })
        openLong = null
      }
    }

    if (hasShort) {
      if (!openShort && evaluateRule(system.shortEntryRule!, row, prevRow)) {
        const price = computeFillPrice(system.shortEntryRule!, row, prevRow, "sell", slippage)
        openShort = { time: row.time, price, barIndex: i }
      } else if (openShort && evaluateRule(system.shortExitRule!, row, prevRow)) {
        const price = computeFillPrice(system.shortExitRule!, row, prevRow, "buy", slippage)
        const pnl = openShort.price - price
        trades.push({
          entryTime: openShort.time, entryPrice: openShort.price,
          exitTime: row.time, exitPrice: price,
          direction: "short", pnl, pnlPercent: (pnl / openShort.price) * 100,
          bars: i - openShort.barIndex,
        })
        openShort = null
      }
    }
  }

  const lastPrice = rows[rows.length - 1].close
  if (openLong) {
    const pnl = lastPrice - openLong.price
    trades.push({ entryTime: openLong.time, entryPrice: openLong.price, exitTime: null, exitPrice: null, direction: "long", pnl, pnlPercent: (pnl / openLong.price) * 100, bars: null })
  }
  if (openShort) {
    const pnl = openShort.price - lastPrice
    trades.push({ entryTime: openShort.time, entryPrice: openShort.price, exitTime: null, exitPrice: null, direction: "short", pnl, pnlPercent: (pnl / openShort.price) * 100, bars: null })
  }

  return trades.sort((a, b) => a.entryTime - b.entryTime)
}

// ---------------------------------------------------------------------------
// Signal markers for data table rows
// ---------------------------------------------------------------------------

export interface SystemSignal {
  type: "entry" | "exit" | "open"
  direction: TradeDirection
  price: number
  pnl: number | null
  pnlPercent: number | null
}

/**
 * Returns a map of row.time → SystemSignal for all entry/exit rows.
 * Open position rows carry unrealized P&L for each open trade (long and/or short).
 */
export function getSystemSignals(
  _system: TradingSystem,
  rows: DataTableRow[],
  trades: Trade[],
): Map<number, SystemSignal> {
  const signals = new Map<number, SystemSignal>()

  for (const trade of trades) {
    signals.set(trade.entryTime, {
      type: "entry", direction: trade.direction, price: trade.entryPrice, pnl: null, pnlPercent: null,
    })

    if (trade.exitTime != null) {
      signals.set(trade.exitTime, {
        type: "exit", direction: trade.direction, price: trade.exitPrice!,
        pnl: trade.pnl, pnlPercent: trade.pnlPercent,
      })
    }
  }

  // Mark rows inside every trade (between entry and exit) with unrealized P&L
  for (const trade of trades) {
    let inside = false
    for (const row of rows) {
      if (row.time === trade.entryTime) { inside = true; continue }
      if (!inside) continue
      // Stop at exit bar — it already has the "exit" signal
      if (trade.exitTime != null && row.time >= trade.exitTime) break
      const pnl = trade.direction === "long"
        ? row.close - trade.entryPrice
        : trade.entryPrice - row.close
      const pnlPercent = (pnl / trade.entryPrice) * 100
      signals.set(row.time, { type: "open", direction: trade.direction, price: row.close, pnl, pnlPercent })
    }
  }

  return signals
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function consecutiveRuns(values: boolean[]): { maxTrue: number; maxFalse: number } {
  let maxTrue = 0, maxFalse = 0, curTrue = 0, curFalse = 0
  for (const v of values) {
    if (v) { curTrue++; curFalse = 0; maxTrue = Math.max(maxTrue, curTrue) }
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
      // % relative to (initialCapital + peak) — capital at the point of peak equity
      const base = initialCapital + peak
      maxPct = base > 0 ? (dd / base) * 100 : 0
    }
  }
  return { absolute: maxAbs, percent: maxPct }
}

function sharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
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
  const pnls = closed.map(t => t.pnl!)
  const pnlPcts = closed.map(t => t.pnlPercent!)
  const wins = pnls.filter(p => p > 0)
  const losses = pnls.filter(p => p <= 0)

  const netProfit = pnls.reduce((a, b) => a + b, 0)
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss

  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0)) / losses.length : 0
  const avgWinPct = wins.length ? pnlPcts.filter(p => p > 0).reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLossPct = losses.length ? Math.abs(pnlPcts.filter(p => p <= 0).reduce((a, b) => a + b, 0)) / losses.length : 0

  const lossRate = 100 - winRate
  const expectancy = ((winRate / 100) * avgWin) - ((lossRate / 100) * avgLoss)

  const winFlags = closed.map(t => (t.pnl ?? 0) > 0)
  const { maxTrue: maxConsWins, maxFalse: maxConsLosses } = consecutiveRuns(winFlags)

  // Equity curve starting from 0
  const equityCurve: Array<{ time: number; equity: number }> = []
  let equity = 0
  for (const t of closed) {
    equity += t.pnl!
    equityCurve.push({ time: t.exitTime!, equity })
  }

  const equityValues = [0, ...equityCurve.map(p => p.equity)]
  // Use the first entry price as the "initial capital" for % drawdown calculation (1-unit position)
  const initialCapital = closed.length > 0 ? closed[0].entryPrice : 0
  const { absolute: maxDrawdown, percent: maxDrawdownPercent } = maxDrawdownFromEquity(equityValues, initialCapital)
  const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : 0

  const avgBars = closed.filter(t => t.bars != null).reduce((s, t) => s + t.bars!, 0) / (closed.filter(t => t.bars != null).length || 1)

  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: +winRate.toFixed(2),
    profitFactor: +profitFactor.toFixed(4),
    netProfit: +netProfit.toFixed(4),
    netProfitPercent: +(initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0).toFixed(4),
    grossProfit: +grossProfit.toFixed(4),
    grossLoss: +grossLoss.toFixed(4),
    avgWin: +avgWin.toFixed(4),
    avgLoss: +avgLoss.toFixed(4),
    avgWinPercent: +avgWinPct.toFixed(4),
    avgLossPercent: +avgLossPct.toFixed(4),
    expectancy: +expectancy.toFixed(4),
    maxConsecutiveWins: maxConsWins,
    maxConsecutiveLosses: maxConsLosses,
    maxDrawdown: +maxDrawdown.toFixed(4),
    maxDrawdownPercent: +maxDrawdownPercent.toFixed(4),
    sharpeRatio: sharpeRatio(pnlPcts),
    sortinoRatio: sortinoRatio(pnlPcts),
    calmarRatio: maxDrawdownPercent > 0 ? +((initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0) / maxDrawdownPercent).toFixed(4) : 0,
    recoveryFactor: +recoveryFactor.toFixed(4),
    avgBarsInTrade: +avgBars.toFixed(1),
    bestTrade: pnls.length ? +Math.max(...pnls).toFixed(4) : 0,
    worstTrade: pnls.length ? +Math.min(...pnls).toFixed(4) : 0,
    equityCurve,
  }
}
