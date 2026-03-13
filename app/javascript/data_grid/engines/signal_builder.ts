import type { TradingSystem, Trade, DataTableRow, TradeDirection } from "../../types/store"

export interface SystemSignal {
  type: "entry" | "exit" | "open"
  direction: TradeDirection
  price: number
  pnl: number | null
  pnlPercent: number | null
}

/**
 * Returns a map of row.time → SystemSignal for all entry/exit rows.
 * Open-position rows carry unrealized P&L for each open trade (long and/or short).
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

  // Mark intermediate rows (between entry and exit) with unrealized P&L
  for (const trade of trades) {
    let inside = false
    for (const row of rows) {
      if (row.time === trade.entryTime) { inside = true; continue }
      if (!inside) continue
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
