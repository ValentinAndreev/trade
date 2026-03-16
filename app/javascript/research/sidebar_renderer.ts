import { BORDER_COLOR } from "../config/theme"
import type { ResearchConfig } from "../types/store"
import {
  METRIC_OPTIONS,
  POSITION_MODE_OPTIONS,
  SYSTEM_OPTIONS,
  moduleOptionsForSystem,
  modulePeriodLabel,
  optimizationOptionsForSystem,
  type LabeledOption,
} from "./catalog"

export default class ResearchSidebarRenderer {
  constructor(
    private sidebarEl: HTMLElement,
    private ctrl: string,
  ) {}

  render(config: ResearchConfig, symbols: string[], timeframes: string[]): void {
    const moduleOptions = moduleOptionsForSystem(config.systemType)
    const optimizationOptions = optimizationOptionsForSystem(config.systemType)

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-4 text-base">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500 uppercase tracking-wide">Research Settings</span>
        </div>

        <div class="flex flex-col gap-3">
          ${selectFieldHTML(this.ctrl, "Symbol", "symbol", symbols, config.symbol)}
          ${selectFieldHTML(this.ctrl, "Timeframe", "timeframe", timeframes, config.timeframe)}
          ${inputFieldHTML(this.ctrl, "Start", "startTime", "datetime-local", config.startTime)}
          ${inputFieldHTML(this.ctrl, "End", "endTime", "datetime-local", config.endTime)}
        </div>

        <hr class="border-[#3a3a4e]">

        <div class="flex flex-col gap-3">
          ${optionFieldHTML(this.ctrl, "System", "systemType", SYSTEM_OPTIONS, config.systemType)}
          ${optionFieldHTML(this.ctrl, "Position mode", "positionMode", POSITION_MODE_OPTIONS, config.positionMode)}
          ${optionFieldHTML(this.ctrl, "Server module", "moduleType", moduleOptions, config.moduleType)}
          ${inputFieldHTML(this.ctrl, modulePeriodLabel(config.moduleType), "modulePeriod", "number", String(config.modulePeriod), 1)}
          ${systemSpecificFieldsHTML(this.ctrl, config)}
        </div>

        <hr class="border-[#3a3a4e]">

        <div class="flex flex-col gap-3">
          ${inputFieldHTML(this.ctrl, "Fee bps", "feeBps", "number", String(config.feeBps), 0, 0.1)}
          ${inputFieldHTML(this.ctrl, "Slippage bps", "slippageBps", "number", String(config.slippageBps), 0, 0.1)}
        </div>

        <hr class="border-[#3a3a4e]">

        <div class="flex flex-col gap-3">
          <label class="inline-flex items-center gap-2 h-10 px-3 rounded border border-[${BORDER_COLOR}] bg-[#141428]">
            <input
              type="checkbox"
              data-field="optimizationEnabled"
              data-action="change->${this.ctrl}#updateResearchConfig"
              class="accent-blue-500"
              ${config.optimizationEnabled ? "checked" : ""}
            >
            <span class="text-sm text-gray-200">Optimization</span>
          </label>
          ${optionFieldHTML(this.ctrl, "Optimize", "optimizationTarget", optimizationOptions, config.optimizationTarget, !config.optimizationEnabled)}
          ${inputFieldHTML(this.ctrl, "From", "optimizationFrom", "number", String(config.optimizationFrom), undefined, 0.1, !config.optimizationEnabled)}
          ${inputFieldHTML(this.ctrl, "To", "optimizationTo", "number", String(config.optimizationTo), undefined, 0.1, !config.optimizationEnabled)}
          ${inputFieldHTML(this.ctrl, "Step", "optimizationStep", "number", String(config.optimizationStep), 0.000001, 0.1, !config.optimizationEnabled)}
          ${metricFieldHTML(this.ctrl, config)}
        </div>

        <button
          data-action="click->${this.ctrl}#runResearch"
          class="h-10 px-4 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium cursor-pointer"
        >Run</button>
      </div>
    `
  }
}

function systemSpecificFieldsHTML(ctrl: string, state: ResearchConfig): string {
  if (state.systemType !== "oscillator_threshold") return ""

  return `
    ${inputFieldHTML(ctrl, "Lower threshold", "lowerThreshold", "number", String(state.lowerThreshold), 0, 0.1)}
    ${inputFieldHTML(ctrl, "Upper threshold", "upperThreshold", "number", String(state.upperThreshold), 0, 0.1)}
  `
}

function selectFieldHTML(ctrl: string, label: string, field: string, options: string[], value: string): string {
  const html = options.map(option => `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`).join("")

  return `
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-gray-400">${label}</span>
      <select
        data-field="${field}"
        data-action="change->${ctrl}#updateResearchConfig"
        class="h-10 rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 text-white"
      >${html}</select>
    </label>
  `
}

function optionFieldHTML<T extends string>(
  ctrl: string,
  label: string,
  field: string,
  options: Array<LabeledOption<T>>,
  value: T,
  disabled = false,
): string {
  const html = options.map(option => `<option value="${option.value}" ${option.value === value ? "selected" : ""}>${option.label}</option>`).join("")

  return `
    <label class="flex flex-col gap-1 text-sm ${disabled ? "opacity-50" : ""}">
      <span class="text-gray-400">${label}</span>
      <select
        data-field="${field}"
        data-action="change->${ctrl}#updateResearchConfig"
        class="h-10 rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 text-white"
        ${disabled ? "disabled" : ""}
      >${html}</select>
    </label>
  `
}

function inputFieldHTML(
  ctrl: string,
  label: string,
  field: string,
  type: string,
  value: string,
  min?: number,
  step?: number,
  disabled = false,
): string {
  const attrs = [
    `type="${type}"`,
    `value="${value}"`,
    min != null ? `min="${min}"` : "",
    step != null ? `step="${step}"` : "",
    disabled ? "disabled" : "",
  ].filter(Boolean).join(" ")

  return `
    <label class="flex flex-col gap-1 text-sm ${disabled ? "opacity-50" : ""}">
      <span class="text-gray-400">${label}</span>
      <input
        ${attrs}
        data-field="${field}"
        data-action="change->${ctrl}#updateResearchConfig"
        class="h-10 rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 text-white disabled:cursor-not-allowed"
      >
    </label>
  `
}

function metricFieldHTML(ctrl: string, state: ResearchConfig): string {
  const options = METRIC_OPTIONS.map(option => `
    <option value="${option.key}" ${option.key === state.selectedMetric ? "selected" : ""}>${option.label}</option>
  `).join("")

  return `
    <label class="flex flex-col gap-1 text-sm ${state.optimizationEnabled ? "" : "opacity-50"}">
      <span class="text-gray-400">Optimization metric</span>
      <select
        data-field="selectedMetric"
        data-action="change->${ctrl}#updateResearchConfig"
        class="h-10 rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 text-white"
        ${state.optimizationEnabled ? "" : "disabled"}
      >${options}</select>
    </label>
  `
}
