import { describe, expect, it } from "vitest"
import { optimizationParamKey, optimizationParamValue, runSummary } from "../../research/summary"
import type { ProcessedResearchRun } from "../../research/types"

describe("research summary helpers", () => {
  const run: ProcessedResearchRun = {
    params: {
      module_type: "rsi",
      module_period: 14,
      lower_threshold: 30,
      upper_threshold: 70,
      position_mode: "long_short",
    },
    trades: [],
    stats: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      profitFactor: 0,
      netProfit: 0,
      netProfitPercent: 0,
      grossProfit: 0,
      grossLoss: 0,
      avgWin: 0,
      avgLoss: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      expectancy: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      recoveryFactor: 0,
      avgBarsInTrade: 0,
      bestTrade: 0,
      worstTrade: 0,
      equityCurve: [],
    },
  }

  it("maps optimization targets to runtime param keys", () => {
    expect(optimizationParamKey("module.period")).toBe("module_period")
    expect(optimizationParamKey("system.lower_threshold")).toBe("lower_threshold")
    expect(optimizationParamValue(run, "system.upper_threshold")).toBe(70)
  })

  it("builds readable run summary", () => {
    expect(runSummary(run)).toContain("RSI period 14")
    expect(runSummary(run)).toContain("30.00/70.00")
  })
})
