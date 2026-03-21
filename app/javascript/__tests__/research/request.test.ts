import { describe, expect, it } from "vitest"
import { buildResearchRequest } from "../../research/request"
import type { ResearchState } from "../../research/state"

describe("buildResearchRequest", () => {
  it("builds payload with system, execution and optimization blocks", () => {
    const state: ResearchState = {
      symbol: "BTCUSD",
      timeframe: "1h",
      startTime: "2026-03-01T00:00",
      endTime: "2026-03-10T00:00",
      systemId: "rsi_threshold",
      systemPath: "momentum/rsi_threshold.yml",
      systemYaml: [
        "id: rsi_threshold",
        "name: RSI Threshold Reversal",
        "modules:",
        "  rsi:",
        "    type: rsi",
        "    period: 14",
      ].join("\n"),
      feeBps: 4,
      slippageBps: 2,
      optimizationEnabled: true,
      optimizationTarget: "params.lower_threshold",
      optimizationFrom: 10,
      optimizationTo: 40,
      optimizationStep: 5,
      selectedMetric: "sharpeRatio",
      resultsSplitRatio: 0.38,
    }

    expect(buildResearchRequest(state, "run-123")).toEqual({
      run_id: "run-123",
      symbol: "BTCUSD",
      timeframe: "1h",
      start_time: new Date("2026-03-01T00:00").toISOString(),
      end_time: new Date("2026-03-10T00:00").toISOString(),
      system_id: "rsi_threshold",
      system_path: "momentum/rsi_threshold.yml",
      system_yaml: state.systemYaml,
      execution: {
        fee_bps: 4,
        slippage_bps: 2,
      },
      optimization: {
        enabled: true,
        target: "params.lower_threshold",
        from: 10,
        to: 40,
        step: 5,
      },
    })
  })
})
