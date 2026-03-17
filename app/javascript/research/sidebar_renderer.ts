import { BORDER_COLOR } from "../config/theme"
import type { ResearchConfig } from "../types/store"
import { escapeHTML } from "../utils/dom"
import { METRIC_OPTIONS } from "./catalog"
import type { ResearchCatalogEntry } from "./dsl"
import { renderFileManagerModal } from "./file_manager"

export default class ResearchSidebarRenderer {
  constructor(
    private sidebarEl: HTMLElement,
    private ctrl: string,
  ) {}

  render(
    config: ResearchConfig,
    symbols: string[],
    timeframes: string[],
    catalog: ResearchCatalogEntry[],
    directories: string[],
    filePickerOpen: boolean,
    filePickerQuery: string,
    filePickerDirectoryPath: string,
    filePickerSelectedPath: string | null,
  ): void {
    const selectedSystem = catalog.find(entry => entry.relative_path === config.systemPath)
      || catalog.find(entry => entry.id === config.systemId)
      || catalog[0]
      || null
    const metadata = selectedSystem?.metadata || null
    const optimizationTargets = metadata?.optimization_targets || []
    const selectedOptimizationTarget = optimizationTargets.some(option => option.value === config.optimizationTarget)
      ? config.optimizationTarget
      : (optimizationTargets[0]?.value || config.optimizationTarget)
    const runDisabled = !selectedSystem

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-4 text-base">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500 uppercase tracking-wide">Test/Optimization</span>
          <span class="text-xs text-gray-500">${selectedSystem ? escapeHTML(selectedSystem.relative_path) : "No YAML files"}</span>
        </div>

        <div class="flex flex-col gap-3">
          ${selectFieldHTML(this.ctrl, "Symbol", "symbol", symbols, config.symbol)}
          ${selectFieldHTML(this.ctrl, "Timeframe", "timeframe", timeframes, config.timeframe)}
          ${inputFieldHTML(this.ctrl, "Start", "startTime", "datetime-local", config.startTime)}
          ${inputFieldHTML(this.ctrl, "End", "endTime", "datetime-local", config.endTime)}
        </div>

        <hr class="border-[#3a3a4e]">

        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-2 text-sm">
            <span class="text-gray-400">YAML file</span>
            <div class="rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 py-2 font-mono text-xs text-gray-300">
              ${selectedSystem ? escapeHTML(selectedSystem.relative_path) : '<span class="text-gray-500">No YAML file selected</span>'}
            </div>
            <button
              type="button"
              data-action="click->${this.ctrl}#openResearchFilePicker"
              class="h-9 rounded border border-[${BORDER_COLOR}] bg-[#0f1020] text-sm text-gray-200 hover:text-white cursor-pointer"
            >Open file</button>
          </div>
          ${systemSummaryHTML(selectedSystem)}
          <button
            type="button"
            data-action="click->${this.ctrl}#openResearchSystemEditor"
            class="h-9 rounded border border-[${BORDER_COLOR}] bg-[#141428] text-sm text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            ${selectedSystem ? "" : "disabled"}
          >Open in System editor</button>
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
          ${optimizationFieldHTML(this.ctrl, optimizationTargets, selectedOptimizationTarget, config.optimizationEnabled)}
          ${inputFieldHTML(this.ctrl, "From", "optimizationFrom", "number", String(config.optimizationFrom), undefined, 0.1, !config.optimizationEnabled)}
          ${inputFieldHTML(this.ctrl, "To", "optimizationTo", "number", String(config.optimizationTo), undefined, 0.1, !config.optimizationEnabled)}
          ${inputFieldHTML(this.ctrl, "Step", "optimizationStep", "number", String(config.optimizationStep), 0.000001, 0.1, !config.optimizationEnabled)}
          ${metricFieldHTML(this.ctrl, config.selectedMetric, config.optimizationEnabled)}
        </div>

        <button
          data-action="click->${this.ctrl}#runResearch"
          class="h-10 px-4 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium cursor-pointer"
          ${runDisabled ? "disabled" : ""}
        >Run</button>

        ${filePickerOpen ? renderFileManagerModal({
          ctrl: this.ctrl,
          title: "Open YAML file",
          catalog,
          directories,
          currentDirectoryPath: filePickerDirectoryPath,
          selectedPath: filePickerSelectedPath,
          searchQuery: filePickerQuery,
          closeAction: `click->${this.ctrl}#closeResearchFilePicker`,
          navigateAction: `click->${this.ctrl}#navigateResearchFileManager`,
          selectAction: `click->${this.ctrl}#selectResearchFileManagerEntry`,
          openAction: `click->${this.ctrl}#openResearchFileManagerEntry`,
          confirmAction: `click->${this.ctrl}#confirmResearchFileSelection`,
          searchAction: `input->${this.ctrl}#updateResearchFilePickerQuery`,
          createDirectoryAction: `click->${this.ctrl}#createResearchDirectory`,
          renameAction: `click->${this.ctrl}#renameResearchEntry`,
          deleteAction: `click->${this.ctrl}#deleteResearchEntry`,
          confirmLabel: "Open",
        }) : ""}
      </div>
    `
  }
}

function selectFieldHTML(ctrl: string, label: string, field: string, options: string[], value: string): string {
  const html = options.map(option => `<option value="${escapeHTML(option)}" ${option === value ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")

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
    `value="${escapeHTML(value)}"`,
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

function systemSummaryHTML(system: ResearchCatalogEntry | null): string {
  if (!system) {
    return `<div class="rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 py-2 text-sm text-gray-500">Open or save a YAML system in System editor first.</div>`
  }

  const moduleParams = Object.entries(system.metadata.module.params).map(([key, value]) => `${escapeHTML(key)}=${escapeHTML(String(value))}`).join(", ")
  const runtimeParams = Object.entries(system.metadata.params).map(([key, value]) => `${escapeHTML(key)}=${escapeHTML(String(value))}`).join(", ")
  const conditions = system.metadata.conditions.map(name => `<span class="px-2 py-0.5 rounded bg-[#0f1020] text-blue-200">${escapeHTML(name)}</span>`).join("")

  return `
    <div class="rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 py-2 text-sm flex flex-col gap-2">
      <div><span class="text-gray-500">File:</span> <span class="text-white font-mono">${escapeHTML(system.relative_path)}</span></div>
      <div><span class="text-gray-500">Module:</span> <span class="text-white">${escapeHTML(system.metadata.module.type.toUpperCase())}</span> <span class="text-gray-400">${escapeHTML(moduleParams)}</span></div>
      <div><span class="text-gray-500">Params:</span> <span class="text-gray-300">${escapeHTML(runtimeParams || "none")}</span></div>
      <div class="flex flex-wrap gap-1"><span class="text-gray-500 mr-1">Conditions:</span>${conditions || '<span class="text-gray-500">none</span>'}</div>
    </div>
  `
}

function optimizationFieldHTML(
  ctrl: string,
  options: Array<{ value: string; label: string }>,
  value: string,
  optimizationEnabled: boolean,
): string {
  const disabled = !optimizationEnabled || options.length === 0
  const html = options.map(option => `<option value="${escapeHTML(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHTML(option.label)}</option>`).join("")

  return `
    <label class="flex flex-col gap-1 text-sm ${disabled ? "opacity-50" : ""}">
      <span class="text-gray-400">Optimize</span>
      <select
        data-field="optimizationTarget"
        data-action="change->${ctrl}#updateResearchConfig"
        class="h-10 rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 text-white"
        ${disabled ? "disabled" : ""}
      >${html}</select>
    </label>
  `
}

function metricFieldHTML(ctrl: string, selectedMetric: string, optimizationEnabled: boolean): string {
  const options = METRIC_OPTIONS.map(option => `
    <option value="${option.key}" ${option.key === selectedMetric ? "selected" : ""}>${option.label}</option>
  `).join("")

  return `
    <label class="flex flex-col gap-1 text-sm ${optimizationEnabled ? "" : "opacity-50"}">
      <span class="text-gray-400">Optimization metric</span>
      <select
        data-field="selectedMetric"
        data-action="change->${ctrl}#updateResearchConfig"
        class="h-10 rounded border border-[${BORDER_COLOR}] bg-[#141428] px-3 text-white"
        ${optimizationEnabled ? "" : "disabled"}
      >${options}</select>
    </label>
  `
}
