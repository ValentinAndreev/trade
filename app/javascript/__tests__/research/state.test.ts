import { describe, expect, it } from "vitest"
import { buildDefaultResearchState, normalizeResearchState } from "../../research/state"

describe("research state", () => {
  it("builds defaults from app config", () => {
    const state = buildDefaultResearchState({
      symbols: ["ETHUSD", "BTCUSD"],
      timeframes: ["5m", "1h"],
      indicators: [],
    })

    expect(state.symbol).toBe("ETHUSD")
    expect(state.timeframe).toBe("1h")
    expect(state.systemType).toBe("price_module_cross")
    expect(state.moduleType).toBe("ema")
  })

  it("normalizes module and optimization target for selected system", () => {
    const state = buildDefaultResearchState({
      symbols: [],
      timeframes: [],
      indicators: [],
    })

    state.systemType = "price_module_cross"
    state.moduleType = "rsi"
    state.optimizationTarget = "system.upper_threshold"
    state.modulePeriod = 0
    state.optimizationStep = 0

    normalizeResearchState(state)

    expect(state.moduleType).toBe("ema")
    expect(state.optimizationTarget).toBe("module.period")
    expect(state.modulePeriod).toBe(1)
    expect(state.optimizationStep).toBe(1)
  })
})
