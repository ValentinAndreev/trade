import { apiFetch } from "../services/api_fetch"
import { showToast } from "../services/toast"
import type { ProcessedResearchRun, ResearchApiResponse } from "./types"
import { processResearchRuns } from "./results"
import type { ResearchState } from "./state"

export async function runResearch(state: ResearchState, runId?: string): Promise<ProcessedResearchRun[] | null> {
  const response = await apiFetch("/api/research/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildResearchRequest(state, runId)),
  })

  if (!response) return null

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    showToast(error.error || "Research run failed")
    return null
  }

  const payload = await response.json() as ResearchApiResponse
  return processResearchRuns(payload.runs)
}

export function buildResearchRequest(state: ResearchState, runId?: string) {
  return {
    ...(runId ? { run_id: runId } : {}),
    symbol: state.symbol,
    timeframe: state.timeframe,
    start_time: toIsoString(state.startTime),
    end_time: toIsoString(state.endTime),
    system: {
      type: state.systemType,
      params: systemParamsPayload(state),
    },
    module: {
      type: state.moduleType,
      params: {
        period: state.modulePeriod,
      },
    },
    execution: {
      fee_bps: state.feeBps,
      slippage_bps: state.slippageBps,
    },
    optimization: {
      enabled: state.optimizationEnabled,
      target: state.optimizationTarget,
      from: state.optimizationFrom,
      to: state.optimizationTo,
      step: state.optimizationStep,
    },
  }
}

function systemParamsPayload(state: ResearchState): Record<string, number | string> {
  const payload: Record<string, number | string> = {
    position_mode: state.positionMode,
  }

  if (state.systemType === "oscillator_threshold") {
    payload.lower_threshold = state.lowerThreshold
    payload.upper_threshold = state.upperThreshold
  }

  return payload
}

function toIsoString(value: string): string {
  return new Date(value).toISOString()
}
