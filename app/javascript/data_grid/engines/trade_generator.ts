import type { TradingSystem, Trade, DataTableRow, ConditionRule } from "../../types/store"
import { resolveColumnValue, evaluateRule } from "./rule_evaluator"

type OpenPos = { time: number; price: number; barIndex: number }

/**
 * For cross_above / cross_below: fill at the compareColumn value on the *previous* bar
 * (the level we expect to cross) ± slippage.
 * For all other rule types: fill at bar's close ± slippage.
 */
export function computeFillPrice(
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

/**
 * Generate completed and open trades from rows for a single system.
 * Long and short positions are tracked independently. Position size = 1 unit.
 */
export function generateTrades(system: TradingSystem, rows: DataTableRow[]): Trade[] {
  if (!rows.length) return []

  const trades: Trade[] = []
  let openLong:  OpenPos | null = null
  let openShort: OpenPos | null = null

  const hasLong  = !!(system.longEntryRule  && system.longExitRule)
  const hasShort = !!(system.shortEntryRule && system.shortExitRule)
  const slippage = system.slippage ?? 0

  for (let i = 0; i < rows.length; i++) {
    const row     = rows[i]
    const prevRow = i > 0 ? rows[i - 1] : null

    if (hasLong) {
      if (!openLong && evaluateRule(system.longEntryRule!, row, prevRow)) {
        openLong = { time: row.time, price: computeFillPrice(system.longEntryRule!, row, prevRow, "buy", slippage), barIndex: i }
      } else if (openLong && evaluateRule(system.longExitRule!, row, prevRow)) {
        const price = computeFillPrice(system.longExitRule!, row, prevRow, "sell", slippage)
        const pnl = price - openLong.price
        trades.push({ entryTime: openLong.time, entryPrice: openLong.price, exitTime: row.time, exitPrice: price, direction: "long", pnl, pnlPercent: (pnl / openLong.price) * 100, bars: i - openLong.barIndex })
        openLong = null
      }
    }

    if (hasShort) {
      if (!openShort && evaluateRule(system.shortEntryRule!, row, prevRow)) {
        openShort = { time: row.time, price: computeFillPrice(system.shortEntryRule!, row, prevRow, "sell", slippage), barIndex: i }
      } else if (openShort && evaluateRule(system.shortExitRule!, row, prevRow)) {
        const price = computeFillPrice(system.shortExitRule!, row, prevRow, "buy", slippage)
        const pnl = openShort.price - price
        trades.push({ entryTime: openShort.time, entryPrice: openShort.price, exitTime: row.time, exitPrice: price, direction: "short", pnl, pnlPercent: (pnl / openShort.price) * 100, bars: i - openShort.barIndex })
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
