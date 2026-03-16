import type {
  ResearchMetricKey,
  ResearchModuleType,
  ResearchOptimizationTarget,
  ResearchPositionMode,
  ResearchSystemType,
} from "../types/store"

export type {
  ResearchMetricKey,
  ResearchModuleType,
  ResearchOptimizationTarget,
  ResearchPositionMode,
  ResearchSystemType,
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

export const SYSTEM_OPTIONS: Array<LabeledOption<ResearchSystemType>> = [
  { value: "price_module_cross", label: "Price vs module cross" },
  { value: "oscillator_threshold", label: "Oscillator thresholds" },
]

export const POSITION_MODE_OPTIONS: Array<LabeledOption<ResearchPositionMode>> = [
  { value: "long_short", label: "Long + Short" },
  { value: "long_only", label: "Long only" },
  { value: "short_only", label: "Short only" },
]

const MODULE_OPTIONS_BY_SYSTEM: Record<ResearchSystemType, Array<LabeledOption<ResearchModuleType>>> = {
  price_module_cross: [{ value: "ema", label: "EMA" }],
  oscillator_threshold: [{ value: "rsi", label: "RSI" }],
}

const OPTIMIZATION_OPTIONS_BY_SYSTEM: Record<ResearchSystemType, Array<LabeledOption<ResearchOptimizationTarget>>> = {
  price_module_cross: [{ value: "module.period", label: "Module period" }],
  oscillator_threshold: [
    { value: "module.period", label: "Module period" },
    { value: "system.lower_threshold", label: "Lower threshold" },
    { value: "system.upper_threshold", label: "Upper threshold" },
  ],
}

export function moduleOptionsForSystem(systemType: ResearchSystemType): Array<LabeledOption<ResearchModuleType>> {
  return MODULE_OPTIONS_BY_SYSTEM[systemType]
}

export function optimizationOptionsForSystem(systemType: ResearchSystemType): Array<LabeledOption<ResearchOptimizationTarget>> {
  return OPTIMIZATION_OPTIONS_BY_SYSTEM[systemType]
}

export function modulePeriodLabel(moduleType: ResearchModuleType): string {
  return moduleType === "rsi" ? "RSI period" : "EMA period"
}

export function metricLabel(key: ResearchMetricKey): string {
  return METRIC_OPTIONS.find(option => option.key === key)?.label || key
}

export function optimizationTargetLabel(target: ResearchOptimizationTarget): string {
  for (const options of Object.values(OPTIMIZATION_OPTIONS_BY_SYSTEM)) {
    const match = options.find(option => option.value === target)
    if (match) return match.label
  }
  return target
}

export function positionModeLabel(value: unknown): string {
  const str = String(value || "long_short")
  return POSITION_MODE_OPTIONS.find(option => option.value === str)?.label || str
}
