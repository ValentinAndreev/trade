import { describe, it, expect } from "vitest"
import { generateTrades, getSystemSignals, computeSystemStats } from "../../data_grid/system_engine"
import type { TradingSystem, DataTableRow } from "../../types/store"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(time: number, close: number, extra: Record<string, number> = {}): DataTableRow {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100, ...extra }
}

function simpleSystem(overrides: Partial<TradingSystem> = {}): TradingSystem {
  return {
    id: "s1",
    name: "Test",
    enabled: true,
    longEntryRule:  { type: "value_gt", column: "close", value: 100 },
    longExitRule:   { type: "value_lt", column: "close", value: 100 },
    shortEntryRule: undefined,
    shortExitRule:  undefined,
    slippage: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeFillPrice (tested indirectly via generateTrades)
// ---------------------------------------------------------------------------

describe("generateTrades — fill price", () => {
  it("uses close price by default", () => {
    const rows = [
      makeRow(1, 90),
      makeRow(2, 110),  // entry: close=110 > 100
      makeRow(3, 95),   // exit:  close=95 < 100
    ]
    const trades = generateTrades(simpleSystem(), rows)
    expect(trades[0]?.entryPrice).toBe(110)
    expect(trades[0]?.exitPrice).toBe(95)
  })

  it("uses previous compareColumn value for cross_above", () => {
    const rows = [
      makeRow(1, 90,  { sma: 95 }),
      makeRow(2, 98,  { sma: 97 }),  // prev_close(90) <= prev_sma(95), cur_close(98) > cur_sma(97) → cross_above
      makeRow(3, 80,  { sma: 85 }),
    ]
    const sys = simpleSystem({
      longEntryRule: { type: "cross_above", column: "close", value: 0, compareColumn: "sma" },
      longExitRule:  { type: "value_lt", column: "close", value: 85 },
      slippage: 0,
    })
    const trades = generateTrades(sys, rows)
    // fill price = prev sma = 95 (no slippage)
    expect(trades[0]?.entryPrice).toBe(95)
  })

  it("applies slippage to fill price", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 95)]
    const trades = generateTrades(simpleSystem({ slippage: 2 }), rows)
    // buy entry: close(110) + 2 = 112
    expect(trades[0]?.entryPrice).toBe(112)
    // sell exit: close(95) - 2 = 93
    expect(trades[0]?.exitPrice).toBe(93)
  })
})

// ---------------------------------------------------------------------------
// generateTrades
// ---------------------------------------------------------------------------

describe("generateTrades", () => {
  it("returns empty array for empty rows", () => {
    expect(generateTrades(simpleSystem(), [])).toEqual([])
  })

  it("generates a single long trade", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 120), makeRow(4, 90)]
    const trades = generateTrades(simpleSystem(), rows)
    expect(trades).toHaveLength(1)
    expect(trades[0].direction).toBe("long")
    expect(trades[0].entryTime).toBe(2)
    expect(trades[0].exitTime).toBe(4)
    expect(trades[0].pnl).toBeCloseTo(90 - 110)
  })

  it("marks open position when no exit triggers", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 120)]
    const trades = generateTrades(simpleSystem(), rows)
    expect(trades).toHaveLength(1)
    expect(trades[0].exitTime).toBeNull()
  })

  it("generates short trades when short rules defined", () => {
    const sys = simpleSystem({
      longEntryRule: undefined,
      longExitRule: undefined,
      shortEntryRule: { type: "value_gt", column: "close", value: 100 },
      shortExitRule:  { type: "value_lt", column: "close", value: 100 },
    })
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 90)]
    const trades = generateTrades(sys, rows)
    expect(trades[0].direction).toBe("short")
    expect(trades[0].pnl).toBeCloseTo(110 - 90)
  })

  it("generates multiple sequential trades", () => {
    const rows = [
      makeRow(1, 90),
      makeRow(2, 110), // long entry
      makeRow(3, 90),  // long exit
      makeRow(4, 90),
      makeRow(5, 110), // long entry
      makeRow(6, 90),  // long exit
    ]
    const trades = generateTrades(simpleSystem(), rows)
    expect(trades).toHaveLength(2)
  })

  it("returns sorted by entryTime", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 90)]
    const trades = generateTrades(simpleSystem(), rows)
    expect(trades[0].entryTime).toBeLessThanOrEqual(trades[trades.length - 1].entryTime)
  })
})

// ---------------------------------------------------------------------------
// getSystemSignals
// ---------------------------------------------------------------------------

describe("getSystemSignals", () => {
  const sys = simpleSystem()

  it("marks entry rows", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 120)]
    const trades = generateTrades(sys, rows)
    const signals = getSystemSignals(sys, rows, trades)
    expect(signals.get(2)?.type).toBe("entry")
  })

  it("marks exit rows", () => {
    const rows = [makeRow(1, 90), makeRow(2, 110), makeRow(3, 90)]
    const trades = generateTrades(sys, rows)
    const signals = getSystemSignals(sys, rows, trades)
    expect(signals.get(3)?.type).toBe("exit")
  })

  it("marks intermediate rows as open with unrealized P&L", () => {
    const rows = [
      makeRow(1, 90),
      makeRow(2, 110),  // entry
      makeRow(3, 115),  // open (unrealized)
      makeRow(4, 90),   // exit
    ]
    const trades = generateTrades(sys, rows)
    const signals = getSystemSignals(sys, rows, trades)
    expect(signals.get(3)?.type).toBe("open")
    expect(signals.get(3)?.pnl).toBeCloseTo(115 - 110)
  })

  it("returns empty map when no trades", () => {
    const rows = [makeRow(1, 90), makeRow(2, 95)]
    const signals = getSystemSignals(sys, rows, [])
    expect(signals.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeSystemStats
// ---------------------------------------------------------------------------

describe("computeSystemStats", () => {
  it("returns zero stats for no trades", () => {
    const stats = computeSystemStats([])
    expect(stats.totalTrades).toBe(0)
    expect(stats.netProfit).toBe(0)
    expect(stats.winRate).toBe(0)
    expect(stats.maxDrawdown).toBe(0)
  })

  it("computes net profit and win rate", () => {
    const trades = [
      { entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 120, direction: "long" as const, pnl: 20, pnlPercent: 20, bars: 1 },
      { entryTime: 3, entryPrice: 120, exitTime: 4, exitPrice: 100, direction: "long" as const, pnl: -20, pnlPercent: -16.67, bars: 1 },
      { entryTime: 5, entryPrice: 100, exitTime: 6, exitPrice: 110, direction: "long" as const, pnl: 10, pnlPercent: 10, bars: 1 },
    ]
    const stats = computeSystemStats(trades)
    expect(stats.totalTrades).toBe(3)
    expect(stats.netProfit).toBeCloseTo(10)
    expect(stats.winRate).toBeCloseTo(66.67, 1)
    expect(stats.winningTrades).toBe(2)
    expect(stats.losingTrades).toBe(1)
  })

  it("all winners: no drawdown", () => {
    const trades = [
      { entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 110, direction: "long" as const, pnl: 10, pnlPercent: 10, bars: 1 },
      { entryTime: 3, entryPrice: 110, exitTime: 4, exitPrice: 120, direction: "long" as const, pnl: 10, pnlPercent: 9.09, bars: 1 },
    ]
    const stats = computeSystemStats(trades)
    expect(stats.maxDrawdown).toBe(0)
    expect(stats.netProfit).toBeCloseTo(20)
  })

  it("all losers: full drawdown", () => {
    const trades = [
      { entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 90, direction: "long" as const, pnl: -10, pnlPercent: -10, bars: 1 },
      { entryTime: 3, entryPrice: 100, exitTime: 4, exitPrice: 90, direction: "long" as const, pnl: -10, pnlPercent: -10, bars: 1 },
    ]
    const stats = computeSystemStats(trades)
    expect(stats.netProfit).toBeCloseTo(-20)
    expect(stats.maxDrawdown).toBeGreaterThan(0)
    expect(stats.winRate).toBe(0)
  })

  it("open trades (exitTime=null) are excluded from stats", () => {
    const trades = [
      { entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 110, direction: "long" as const, pnl: 10, pnlPercent: 10, bars: 1 },
      { entryTime: 3, entryPrice: 100, exitTime: null, exitPrice: null, direction: "long" as const, pnl: 5, pnlPercent: 5, bars: null },
    ]
    const stats = computeSystemStats(trades)
    expect(stats.totalTrades).toBe(2)   // includes open
    expect(stats.winningTrades).toBe(1) // only closed winners
  })

  it("maxDrawdownPercent uses initialCapital as base", () => {
    const trades = [
      { entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 110, direction: "long" as const, pnl: 10, pnlPercent: 10, bars: 1 },
      { entryTime: 3, entryPrice: 100, exitTime: 4, exitPrice: 80, direction: "long" as const, pnl: -30, pnlPercent: -30, bars: 1 },
    ]
    const stats = computeSystemStats(trades)
    expect(stats.maxDrawdownPercent).toBeGreaterThan(0)
    expect(stats.maxDrawdownPercent).toBeLessThan(100)
  })

  it("equityCurve has one point per closed trade", () => {
    const trades = [
      { entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 110, direction: "long" as const, pnl: 10, pnlPercent: 10, bars: 1 },
      { entryTime: 3, entryPrice: 100, exitTime: 4, exitPrice: 120, direction: "long" as const, pnl: 20, pnlPercent: 20, bars: 1 },
    ]
    const stats = computeSystemStats(trades)
    expect(stats.equityCurve).toHaveLength(2)
    expect(stats.equityCurve[0].equity).toBeCloseTo(10)
    expect(stats.equityCurve[1].equity).toBeCloseTo(30)
  })
})
