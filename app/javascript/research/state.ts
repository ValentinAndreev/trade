import type { AppConfig } from "../tabs/config"
import type { ResearchConfig } from "../types/store"
import {
  moduleOptionsForSystem,
  optimizationOptionsForSystem,
} from "./catalog"

export type ResearchState = ResearchConfig

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
    systemType: "price_module_cross",
    positionMode: "long_short",
    moduleType: "ema",
    modulePeriod: 20,
    lowerThreshold: 30,
    upperThreshold: 70,
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
  state.symbol = valueOf(root, "symbol", state.symbol)
  state.timeframe = valueOf(root, "timeframe", state.timeframe)
  state.startTime = valueOf(root, "startTime", state.startTime)
  state.endTime = valueOf(root, "endTime", state.endTime)
  state.systemType = valueOf(root, "systemType", state.systemType) as ResearchSystemType
  state.positionMode = valueOf(root, "positionMode", state.positionMode) as ResearchPositionMode
  state.moduleType = valueOf(root, "moduleType", state.moduleType) as ResearchModuleType
  state.modulePeriod = numericValue(root, "modulePeriod", state.modulePeriod)
  state.lowerThreshold = numericValue(root, "lowerThreshold", state.lowerThreshold)
  state.upperThreshold = numericValue(root, "upperThreshold", state.upperThreshold)
  state.feeBps = numericValue(root, "feeBps", state.feeBps)
  state.slippageBps = numericValue(root, "slippageBps", state.slippageBps)
  state.optimizationEnabled = checkedValue(root, "optimizationEnabled", state.optimizationEnabled)
  state.optimizationTarget = valueOf(root, "optimizationTarget", state.optimizationTarget) as ResearchOptimizationTarget
  state.optimizationFrom = numericValue(root, "optimizationFrom", state.optimizationFrom)
  state.optimizationTo = numericValue(root, "optimizationTo", state.optimizationTo)
  state.optimizationStep = numericValue(root, "optimizationStep", state.optimizationStep)
  state.selectedMetric = valueOf(root, "selectedMetric", state.selectedMetric) as ResearchMetricKey

  normalizeResearchState(state)
}

export function normalizeResearchState(state: ResearchState): void {
  const moduleOptions = moduleOptionsForSystem(state.systemType)
  if (!moduleOptions.some(option => option.value === state.moduleType)) {
    state.moduleType = moduleOptions[0]?.value || "ema"
  }

  const optimizationOptions = optimizationOptionsForSystem(state.systemType)
  if (!optimizationOptions.some(option => option.value === state.optimizationTarget)) {
    state.optimizationTarget = optimizationOptions[0]?.value || "module.period"
  }

  if (state.modulePeriod < 1) state.modulePeriod = 1
  if (state.optimizationStep <= 0) state.optimizationStep = 1
  if (!Number.isFinite(state.resultsSplitRatio)) state.resultsSplitRatio = 0.38
  state.resultsSplitRatio = Math.max(0.2, Math.min(0.75, state.resultsSplitRatio))
}

export function toDatetimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function valueOf(root: ParentNode, field: string, fallback: string): string {
  const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${field}"]`)
  return el?.value || fallback
}

function numericValue(root: ParentNode, field: string, fallback: number): number {
  const el = root.querySelector<HTMLInputElement>(`[data-field="${field}"]`)
  const value = Number(el?.value)
  return Number.isFinite(value) ? value : fallback
}

function checkedValue(root: ParentNode, field: string, fallback: boolean): boolean {
  const el = root.querySelector<HTMLInputElement>(`[data-field="${field}"]`)
  return el ? el.checked : fallback
}
