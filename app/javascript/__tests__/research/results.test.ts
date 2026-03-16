import { describe, expect, it } from "vitest"
import { hydrateResearchResult, processResearchRuns, serializeResearchResult } from "../../research/results"
import type { ProcessedResearchRun } from "../../research/types"

describe("research results helpers", () => {
  it("hydrates empty stored result safely", () => {
    expect(hydrateResearchResult(null)).toEqual({ runs: [], selectedRunIndex: 0 })
  })

  it("serializes processed runs back to storable shape", () => {
    const runs: ProcessedResearchRun[] = [{
      params: { module_period: 20 },
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
    }]

    expect(serializeResearchResult(runs, 0)).toEqual({
      runs: [{
        params: { module_period: 20 },
        trades: [],
      }],
      selectedRunIndex: 0,
    })
  })

  it("recomputes stats when processing stored runs", () => {
    const processed = processResearchRuns([{
      params: { module_period: 20 },
      trades: [],
    }])

    expect(processed).toHaveLength(1)
    expect(processed[0].stats.totalTrades).toBe(0)
  })
})
