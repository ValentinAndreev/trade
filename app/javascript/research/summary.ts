import type { SystemStats } from "../types/store"
import {
  humanizeToken,
  moduleLabel,
  positionModeLabel,
  type ResearchMetricKey,
  type ResearchOptimizationTarget,
} from "./catalog"
import type { ProcessedResearchRun } from "./types"

export function metricValue(stats: SystemStats, key: ResearchMetricKey): number {
  const value = stats[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function optimizationParamKey(target: ResearchOptimizationTarget): string {
  if (target === "module.period") return "module_period"
  if (target.startsWith("params.")) return target.slice("params.".length).replace(/\./g, "_")
  return target.replace(/\./g, "_")
}

export function optimizationParamValue(run: ProcessedResearchRun, target: ResearchOptimizationTarget): number {
  return Number(run.params[optimizationParamKey(target)] ?? 0)
}

export function runSummary(run: ProcessedResearchRun): string {
  const moduleType = String(run.params.module_type || "ema")
  const modulePeriod = run.params.module_period
  const positionMode = positionModeLabel(run.params.position_mode)
  const paramSummary = Object.entries(run.params)
    .filter(([key]) => !["system_id", "system_name", "module_type", "module_period", "position_mode"].includes(key))
    .map(([key, value]) => `${humanizeToken(key)} ${formatMaybeNumber(value)}`)
    .join(" · ")
  const parts = [
    run.params.system_name ? String(run.params.system_name) : null,
    `${moduleLabel(moduleType)} period ${formatMaybeNumber(modulePeriod)}`,
    paramSummary || null,
    positionMode,
  ].filter(Boolean)

  return parts.join(" · ")
}

export function formatValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "Inf"
}

function formatMaybeNumber(value: unknown): string {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value)
}

