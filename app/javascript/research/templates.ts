import { BG_HOVER, BG_PRIMARY, BORDER_COLOR } from "../config/theme"
import { metricLabel } from "./catalog"
import type { ResearchProgressInfo } from "./progress"
import type { ResearchState } from "./state"

type ResearchTemplateArgs = {
  state: ResearchState
  busy: boolean
  runsCount: number
  progress: ResearchProgressInfo | null
}

export function renderResearchHTML({ state, busy, runsCount, progress }: ResearchTemplateArgs): string {
  const showOptimization = runsCount > 1

  return `
    <div class="flex flex-col h-full w-full overflow-hidden text-white bg-[${BG_PRIMARY}]">
      <div data-research-results-root class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          data-optimization-pane
          class="${showOptimization ? "flex-none min-h-[16rem] overflow-hidden border-b border-[${BG_HOVER}] flex flex-col" : "hidden"}"
        >
          <div class="flex items-center justify-between px-4 py-2 bg-[#141428]">
            <div class="text-sm text-gray-300">Optimization runs</div>
            <div class="text-xs text-gray-500">${showOptimization ? `${runsCount} runs` : ""}</div>
          </div>
          <div class="grid grid-cols-2 gap-0 flex-1 min-h-0 overflow-hidden">
            <div class="border-r border-[${BG_HOVER}] p-3 min-h-0 flex flex-col">
              <div class="text-xs uppercase tracking-wide text-gray-500 mb-2">${metricLabel(state.selectedMetric)}</div>
              <div data-optimization-chart class="flex-1 min-h-[12rem]"></div>
            </div>
            <div class="p-3 min-w-0 min-h-0" data-runs-grid></div>
          </div>
        </div>
        <div
          data-research-split-handle
          class="${showOptimization ? "flex-none h-1.5 shrink-0 cursor-row-resize bg-[#2a2a3e] hover:bg-[#5a5a7e] transition-colors" : "hidden"}"
        ></div>

        <div data-selected-run class="flex-1 min-h-0 overflow-hidden">
          ${selectedRunPlaceholderHTML(busy, progress)}
        </div>
      </div>
    </div>
  `
}

export function selectedRunPlaceholderHTML(busy: boolean, progress: ResearchProgressInfo | null = null): string {
  if (busy) {
    const width = progress && progress.percent > 0 ? Math.max(6, progress.percent) : 0

    return `
      <div class="flex items-center justify-center h-full p-6">
        <div class="w-full max-w-md rounded-xl border border-[${BORDER_COLOR}] bg-[#141428] p-4 text-center">
          <div class="text-sm font-medium text-white">${progress?.title || "Running research"}</div>
          <div class="mt-2 text-sm text-gray-300">${progress?.detail || "Waiting for server response…"}</div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-[#0f1020]">
            <div class="h-full rounded-full bg-blue-500/80 transition-[width] duration-300" style="width: ${width}%"></div>
          </div>
          <div class="mt-3 flex items-center justify-center gap-3 text-xs text-gray-500">
            <span>${progress?.note || "Waiting for server response…"}</span>
            <span class="font-mono text-blue-300">${progress?.statusLabel || "0%"}</span>
            <span class="font-mono text-blue-300">${progress?.elapsedLabel || "00:00"}</span>
          </div>
        </div>
      </div>
    `
  }

  return `<div class="flex items-center justify-center h-full text-gray-500 text-sm">Configure parameters and run a backtest or optimization.</div>`
}
