import { describe, expect, it } from "vitest"
import { buildDefaultResearchState, normalizeResearchState, researchDateTimeParts, syncResearchStateFromInputs } from "../../research/state"

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
    expect(state.topPaneExpanded).toBeNull()
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
    state.topPaneExpanded = "equity"

    normalizeResearchState(state)

    expect(state.systemId).toBe("price_ema_cross")
    expect(state.systemYaml).toBe("x")
    expect(state.optimizationStep).toBe(1)
    expect(state.topPaneExpanded).toBe("equity")
  })

  it("syncs split UTC date range fields into stored ISO values", () => {
    const state = buildDefaultResearchState({
      symbols: ["BTCUSD"],
      timeframes: ["1h"],
      indicators: [],
    })

    document.body.innerHTML = `
      <input data-field="researchStartDate" value="2026-03-01">
      <input data-field="researchStartHour" value="12">
      <input data-field="researchStartMinute" value="30">
      <input data-field="researchEndDate" value="2026-03-10">
      <input data-field="researchEndHour" value="18">
      <input data-field="researchEndMinute" value="45">
    `

    syncResearchStateFromInputs(document.body, state)

    expect(state.startTime).toBe("2026-03-01T12:30:00.000Z")
    expect(state.endTime).toBe("2026-03-10T18:45:59.000Z")
  })

  it("extracts UTC parts for sidebar rendering", () => {
    expect(researchDateTimeParts("2026-03-01T12:30:00.000Z")).toEqual({
      date: "2026-03-01",
      hour: 12,
      minute: 30,
    })
  })
})
