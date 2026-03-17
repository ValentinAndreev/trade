import type { AppConfig } from "../tabs/config"
import type { ResearchConfig, ResearchMetricKey } from "../types/store"
import { formFieldValue, formFieldNumber, formFieldChecked } from "../utils/dom"

export type ResearchState = ResearchConfig

export const DEFAULT_RESEARCH_SYSTEM_ID = "price_ema_cross"

export function buildDefaultResearchState(config: AppConfig | null): ResearchState {
  const now = new Date()
  const start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
  const symbol = config?.symbols[0] || "BTCUSD"
  const timeframe = config?.timeframes.includes("1h") ? "1h" : (config?.timeframes[0] || "1h")

  return {
    symbol,
    timeframe,
    startTime: toDatetimeLocal(start),
    endTime: toDatetimeLocal(now),
    systemId: DEFAULT_RESEARCH_SYSTEM_ID,
    systemPath: "",
    systemYaml: "",
    feeBps: 4,
    slippageBps: 2,
    optimizationEnabled: false,
    optimizationTarget: "module.period",
    optimizationFrom: 5,
    optimizationTo: 50,
    optimizationStep: 1,
    selectedMetric: "sharpeRatio",
    resultsSplitRatio: 0.38,
  }
}

export function hydrateResearchState(config: AppConfig | null, stored: Partial<ResearchState> | null | undefined): ResearchState {
  const state = buildDefaultResearchState(config)
  if (stored) Object.assign(state, stored)
  normalizeResearchState(state)
  return state
}

export function syncResearchStateFromInputs(root: ParentNode, state: ResearchState): void {
  state.symbol = formFieldValue(root, "symbol", state.symbol)
  state.timeframe = formFieldValue(root, "timeframe", state.timeframe)
  state.startTime = formFieldValue(root, "startTime", state.startTime)
  state.endTime = formFieldValue(root, "endTime", state.endTime)
  state.systemId = formFieldValue(root, "systemId", state.systemId)
  state.systemYaml = formFieldValue(root, "systemYaml", state.systemYaml)
  state.feeBps = formFieldNumber(root, "feeBps", state.feeBps)
  state.slippageBps = formFieldNumber(root, "slippageBps", state.slippageBps)
  state.optimizationEnabled = formFieldChecked(root, "optimizationEnabled", state.optimizationEnabled)
  state.optimizationTarget = formFieldValue(root, "optimizationTarget", state.optimizationTarget)
  state.optimizationFrom = formFieldNumber(root, "optimizationFrom", state.optimizationFrom)
  state.optimizationTo = formFieldNumber(root, "optimizationTo", state.optimizationTo)
  state.optimizationStep = formFieldNumber(root, "optimizationStep", state.optimizationStep)
  state.selectedMetric = formFieldValue(root, "selectedMetric", state.selectedMetric) as ResearchMetricKey

  normalizeResearchState(state)
}

export function normalizeResearchState(state: ResearchState): void {
  if (!state.systemId) state.systemId = DEFAULT_RESEARCH_SYSTEM_ID
  if (typeof state.systemPath !== "string") state.systemPath = ""
  if (typeof state.systemYaml !== "string") state.systemYaml = ""
  if (state.optimizationStep <= 0) state.optimizationStep = 1
  if (!Number.isFinite(state.resultsSplitRatio)) state.resultsSplitRatio = 0.38
  state.resultsSplitRatio = Math.max(0.2, Math.min(0.75, state.resultsSplitRatio))
}

export function toDatetimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

