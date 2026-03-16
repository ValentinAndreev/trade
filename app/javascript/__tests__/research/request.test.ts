import { describe, expect, it } from "vitest"
import { buildResearchRequest } from "../../research/request"
import type { ResearchState } from "../../research/state"

describe("buildResearchRequest", () => {
  it("builds payload with system, module, execution and optimization blocks", () => {
    const state: ResearchState = {
      symbol: "BTCUSD",
      timeframe: "1h",
      startTime: "2026-03-01T00:00",
      endTime: "2026-03-10T00:00",
      systemType: "oscillator_threshold",
      positionMode: "long_only",
      moduleType: "rsi",
      modulePeriod: 14,
      lowerThreshold: 25,
      upperThreshold: 75,
      feeBps: 4,
      slippageBps: 2,
      optimizationEnabled: true,
      optimizationTarget: "system.lower_threshold",
      optimizationFrom: 10,
      optimizationTo: 40,
      optimizationStep: 5,
      selectedMetric: "sharpeRatio",
    }

    expect(buildResearchRequest(state, "run-123")).toEqual({
      run_id: "run-123",
      symbol: "BTCUSD",
      timeframe: "1h",
      start_time: new Date("2026-03-01T00:00").toISOString(),
      end_time: new Date("2026-03-10T00:00").toISOString(),
      system: {
        type: "oscillator_threshold",
        params: {
          position_mode: "long_only",
          lower_threshold: 25,
          upper_threshold: 75,
        },
      },
      module: {
        type: "rsi",
        params: {
          period: 14,
        },
      },
      execution: {
        fee_bps: 4,
        slippage_bps: 2,
      },
      optimization: {
        enabled: true,
        target: "system.lower_threshold",
        from: 10,
        to: 40,
        step: 5,
      },
    })
  })
})
