import type { AppConfig } from "../tabs/config"
import type { ResearchConfig, ResearchMetricKey } from "../types/store"
import { formFieldValue, formFieldNumber, formFieldChecked } from "../utils/dom"

export const DEFAULT_RESEARCH_SYSTEM_ID = "price_ema_cross"
const DEFAULT_RESULTS_SPLIT_RATIO = 0.46
const RESEARCH_START_FIELDS = [ "researchStartDate", "researchStartHour", "researchStartMinute" ] as const
const RESEARCH_END_FIELDS = [ "researchEndDate", "researchEndHour", "researchEndMinute" ] as const

export function buildDefaultResearchState(config: AppConfig | null): ResearchConfig {
  const now = new Date()
  const start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
  const symbol = config?.symbols[0] || "BTCUSD"
  const timeframe = config?.timeframes.includes("1h") ? "1h" : (config?.timeframes[0] || "1h")

  return {
    symbol,
    timeframe,
    startTime: toUtcDateTimeValue(start),
    endTime: toUtcDateTimeValue(now),
    systemId: DEFAULT_RESEARCH_SYSTEM_ID,
    systemPath: "",
    systemYaml: "",
    feeBps: 4,
    slippageBps: 2,
    optimizationEnabled: false,
    optimizationTarget: "",
    optimizationFrom: 5,
    optimizationTo: 50,
    optimizationStep: 1,
    selectedMetric: "sharpeRatio",
    resultsSplitRatio: DEFAULT_RESULTS_SPLIT_RATIO,
    topPaneExpanded: null,
  }
}

export function hydrateResearchState(config: AppConfig | null, stored: Partial<ResearchConfig> | null | undefined): ResearchConfig {
  const state = buildDefaultResearchState(config)
  if (stored) Object.assign(state, stored)
  normalizeResearchState(state)
  return state
}

export function syncResearchStateFromInputs(root: ParentNode, state: ResearchConfig): void {
  state.symbol = formFieldValue(root, "symbol", state.symbol)
  state.timeframe = formFieldValue(root, "timeframe", state.timeframe)
  state.startTime = readResearchDateTime(root, RESEARCH_START_FIELDS, state.startTime) || formFieldValue(root, "startTime", state.startTime)
  state.endTime = readResearchDateTime(root, RESEARCH_END_FIELDS, state.endTime, true) || formFieldValue(root, "endTime", state.endTime)
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

export function normalizeResearchState(state: ResearchConfig): void {
  if (!state.systemId) state.systemId = DEFAULT_RESEARCH_SYSTEM_ID
  if (typeof state.systemPath !== "string") state.systemPath = ""
  if (typeof state.systemYaml !== "string") state.systemYaml = ""
  if (typeof state.optimizationTarget !== "string") state.optimizationTarget = ""
  if (state.optimizationStep <= 0) state.optimizationStep = 1
  if (!Number.isFinite(state.resultsSplitRatio)) state.resultsSplitRatio = DEFAULT_RESULTS_SPLIT_RATIO
  if (state.resultsSplitRatio === 0.38) state.resultsSplitRatio = DEFAULT_RESULTS_SPLIT_RATIO
  state.resultsSplitRatio = Math.max(0.2, Math.min(0.75, state.resultsSplitRatio))
  if (state.topPaneExpanded !== "equity" && state.topPaneExpanded !== "optimization_chart" && state.topPaneExpanded !== "optimization_table") {
    state.topPaneExpanded = null
  }
}

export function researchDateTimeParts(value: string | null | undefined, endOfMinute = false): { date: string; hour: number; minute: number } {
  const fallbackHour = endOfMinute ? 23 : 0
  const fallbackMinute = endOfMinute ? 59 : 0
  if (!value) {
    return { date: "", hour: fallbackHour, minute: fallbackMinute }
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return { date: "", hour: fallbackHour, minute: fallbackMinute }
  }

  return {
    date: parsed.toISOString().slice(0, 10),
    hour: parsed.getUTCHours(),
    minute: parsed.getUTCMinutes(),
  }
}

function toUtcDateTimeValue(date: Date): string {
  return date.toISOString()
}

function readResearchDateTime(
  root: ParentNode,
  fields: readonly [string, string, string],
  fallback: string,
  endOfMinute = false,
): string | null {
  const [dateField, hourField, minuteField] = fields
  const fallbackParts = researchDateTimeParts(fallback, endOfMinute)
  const dateValue = formFieldValue(root, dateField, fallbackParts.date).trim()
  if (!dateValue) return null

  const hour = clampDateTimePart(formFieldValue(root, hourField, String(fallbackParts.hour)), 23)
  const minute = clampDateTimePart(formFieldValue(root, minuteField, String(fallbackParts.minute)), 59)
  const [year, month, day] = dateValue.split("-").map(part => parseInt(part, 10))
  if (![year, month, day].every(Number.isFinite)) return null

  const seconds = endOfMinute ? 59 : 0
  return new Date(Date.UTC(year, month - 1, day, hour, minute, seconds, 0)).toISOString()
}

function clampDateTimePart(value: string, max: number): number {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(max, Math.max(0, parsed))
}
