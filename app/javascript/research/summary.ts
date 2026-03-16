import type { SystemStats } from "../types/store"
import {
  positionModeLabel,
  type ResearchMetricKey,
  type ResearchOptimizationTarget,
} from "./catalog"
import type { ProcessedResearchRun } from "./types"

const OPTIMIZATION_PARAM_KEYS: Record<ResearchOptimizationTarget, string> = {
  "module.period": "module_period",
  "system.lower_threshold": "lower_threshold",
  "system.upper_threshold": "upper_threshold",
}

export function metricValue(stats: SystemStats, key: ResearchMetricKey): number {
  const value = stats[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function optimizationParamKey(target: ResearchOptimizationTarget): string {
  return OPTIMIZATION_PARAM_KEYS[target]
}

export function optimizationParamValue(run: ProcessedResearchRun, target: ResearchOptimizationTarget): number {
  return Number(run.params[optimizationParamKey(target)] ?? 0)
}

export function runSummary(run: ProcessedResearchRun): string {
  const moduleType = String(run.params.module_type || "ema")
  const modulePeriod = run.params.module_period
  const positionMode = positionModeLabel(run.params.position_mode)

  if (moduleType === "rsi") {
    return `RSI period ${modulePeriod} · thresholds ${formatMaybeNumber(run.params.lower_threshold)}/${formatMaybeNumber(run.params.upper_threshold)} · ${positionMode}`
  }

  return `EMA period ${modulePeriod} · ${positionMode}`
}

export function formatValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "Inf"
}

function formatMaybeNumber(value: unknown): string {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value)
}
