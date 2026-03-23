import { apiFetch } from "../services/api_fetch"
import { showToast } from "../services/toast"
import type { ResearchConfig } from "../types/store"
import type { ProcessedResearchRun, ResearchApiResponse } from "./types"
import { processResearchRuns } from "./results"

export async function runResearch(state: ResearchConfig, runId?: string): Promise<ProcessedResearchRun[] | null> {
  const response = await apiFetch("/api/research/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildResearchRequest(state, runId)),
  })

  if (!response) return null

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    showToast(error.diagnostics?.[0]?.message || error.error || "Research run failed")
    return null
  }

  const payload = await response.json() as ResearchApiResponse
  return processResearchRuns(payload.runs)
}

export function buildResearchRequest(state: ResearchConfig, runId?: string) {
  return {
    ...(runId ? { run_id: runId } : {}),
    symbol: state.symbol,
    timeframe: state.timeframe,
    start_time: toIsoString(state.startTime),
    end_time: toIsoString(state.endTime),
    system_id: state.systemId,
    system_path: state.systemPath || null,
    system_yaml: state.systemYaml,
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

function toIsoString(value: string): string {
  return new Date(value).toISOString()
}
