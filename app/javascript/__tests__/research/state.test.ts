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
    expect(state.systemId).toBe("price_ema_cross")
    expect(state.optimizationTarget).toBe("")
    expect(state.systemYaml).toBe("")
  })

  it("normalizes research defaults", () => {
    const state = buildDefaultResearchState({
      symbols: [],
      timeframes: [],
      indicators: [],
    })

    state.systemId = ""
    state.systemYaml = "x"
    state.optimizationStep = 0

    normalizeResearchState(state)

    expect(state.systemId).toBe("price_ema_cross")
    expect(state.systemYaml).toBe("x")
    expect(state.optimizationStep).toBe(1)
  })
})
