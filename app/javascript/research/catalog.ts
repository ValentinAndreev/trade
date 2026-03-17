import type {
  ResearchMetricKey,
  ResearchOptimizationTarget,
  ResearchPositionMode,
} from "../types/store"

export type {
  ResearchMetricKey,
  ResearchOptimizationTarget,
  ResearchPositionMode,
}

export type LabeledOption<T extends string> = {
  value: T
  label: string
}

export const METRIC_OPTIONS: Array<{ key: ResearchMetricKey; label: string }> = [
  { key: "netProfit", label: "Net profit" },
  { key: "netProfitPercent", label: "Net profit %" },
  { key: "winRate", label: "Win rate" },
  { key: "totalTrades", label: "Total trades" },
  { key: "profitFactor", label: "Profit factor" },
  { key: "expectancy", label: "Expectancy" },
  { key: "maxDrawdown", label: "Max drawdown" },
  { key: "maxDrawdownPercent", label: "Max drawdown %" },
  { key: "sharpeRatio", label: "Sharpe ratio" },
  { key: "sortinoRatio", label: "Sortino ratio" },
  { key: "calmarRatio", label: "Calmar ratio" },
  { key: "recoveryFactor", label: "Recovery factor" },
  { key: "avgBarsInTrade", label: "Avg bars in trade" },
  { key: "bestTrade", label: "Best trade" },
  { key: "worstTrade", label: "Worst trade" },
]

export const POSITION_MODE_OPTIONS: Array<LabeledOption<ResearchPositionMode>> = [
  { value: "long_short", label: "Long + Short" },
  { value: "long_only", label: "Long only" },
  { value: "short_only", label: "Short only" },
]

export function metricLabel(key: ResearchMetricKey): string {
  return METRIC_OPTIONS.find(option => option.key === key)?.label || key
}

export function optimizationTargetLabel(target: ResearchOptimizationTarget): string {
  if (target === "module.period") return "Module period"
  if (target.startsWith("params.")) {
    return humanizeToken(target.slice("params.".length))
  }
  return humanizeToken(target)
}

export function positionModeLabel(value: unknown): string {
  const str = String(value || "long_short")
  return POSITION_MODE_OPTIONS.find(option => option.value === str)?.label || str
}

export function moduleLabel(moduleType: string): string {
  return moduleType.toUpperCase()
}

function humanizeToken(value: string): string {
  return value
    .split(/[._]/g)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
}
