import { describe, expect, it } from "vitest"
import { buildResearchProgressInfo, estimateOptimizationRuns, formatElapsed } from "../../research/progress"
import type { ResearchProgressSnapshot } from "../../research/progress_subscription"
import type { ResearchState } from "../../research/state"

const baseState: ResearchState = {
  symbol: "BTCUSD",
  timeframe: "1h",
  startTime: "2026-03-01T00:00",
  endTime: "2026-03-10T00:00",
  systemId: "price_ema_cross",
  systemPath: "price_ema_cross.yml",
  systemYaml: "id: price_ema_cross",
  feeBps: 4,
  slippageBps: 2,
  optimizationEnabled: false,
  optimizationTarget: "module.period",
  optimizationFrom: 5,
  optimizationTo: 50,
  optimizationStep: 5,
  selectedMetric: "sharpeRatio",
  resultsSplitRatio: 0.38,
}

describe("research progress helpers", () => {
  it("estimates optimization run count inclusively", () => {
    expect(estimateOptimizationRuns(baseState)).toBe(10)
  })

  it("formats elapsed duration", () => {
    expect(formatElapsed(65)).toBe("01:05")
    expect(formatElapsed(3661)).toBe("01:01:01")
  })

  it("builds optimization progress info", () => {
    const info = buildResearchProgressInfo({ ...baseState, optimizationEnabled: true }, 12)
    expect(info.title).toBe("Running optimization")
    expect(info.detail).toContain("0/10 runs")
    expect(info.elapsedLabel).toBe("00:12")
    expect(info.percent).toBe(0)
  })

  it("uses server progress snapshot when available", () => {
    const snapshot: ResearchProgressSnapshot = {
      event: "progress",
      totalRuns: 10,
      completedRuns: 4,
      elapsedMs: 12_000,
      lastRunMs: 900,
      currentValue: 23,
      error: null,
    }

    const info = buildResearchProgressInfo({ ...baseState, optimizationEnabled: true }, 1, snapshot)
    expect(info.detail).toContain("4/10 runs")
    expect(info.note).toContain("Current Module period 23")
    expect(info.statusLabel).toBe("40%")
    expect(info.percent).toBe(40)
    expect(info.elapsedLabel).toBe("00:12")
  })
})
