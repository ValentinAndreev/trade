import { BG_HOVER, BG_PRIMARY, BORDER_COLOR, BG_SURFACE, BG_INPUT } from "../config/theme"
import { metricLabel } from "./catalog"
import type { ResearchProgressInfo } from "./progress"
import type { ResearchConfig, ResearchTopPaneKey } from "../types/store"

type ResearchTemplateArgs = {
  state: ResearchConfig
  busy: boolean
  runsCount: number
  progress: ResearchProgressInfo | null
}

export function renderResearchHTML({ state, busy, runsCount, progress }: ResearchTemplateArgs): string {
  const hasResults = !busy && runsCount > 0
  const showOptimization = runsCount > 1
  const expandedPane = resolveExpandedPane(state.topPaneExpanded, showOptimization)
  const visiblePanes = expandedPane ? [expandedPane] : (showOptimization
    ? (["equity", "optimization_chart", "optimization_table"] as ResearchTopPaneKey[])
    : (["equity"] as ResearchTopPaneKey[]))

  return `
    <div class="flex flex-col h-full w-full overflow-hidden text-white bg-[${BG_PRIMARY}]">
      <div data-research-results-root class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          data-research-top-workspace
          class="${hasResults ? "flex-none min-h-[24rem] overflow-hidden border-b border-[${BG_HOVER}] flex flex-col" : "hidden"}"
        >
          <div class="flex items-center justify-between px-4 py-2 bg-[${BG_SURFACE}] border-b border-[${BG_HOVER}]">
            <div class="text-sm text-gray-300">Results overview</div>
            <div class="text-xs text-gray-500">${runsCount > 0 ? `${runsCount} run${runsCount === 1 ? "" : "s"}` : ""}</div>
          </div>
          <div class="${visiblePanes.length === 1 ? "flex-1 min-h-0 flex" : "grid grid-cols-3 flex-1 min-h-0 overflow-hidden"}">
            ${visiblePanes.map((pane, index) => researchPaneHTML({
              pane,
              expandedPane,
              showOptimization,
              state,
              withBorder: visiblePanes.length > 1 && index < visiblePanes.length - 1,
            })).join("")}
          </div>
        </div>
        <div
          data-research-split-handle
          class="${hasResults ? "flex-none h-1.5 shrink-0 cursor-row-resize bg-[#2a2a3e] hover:bg-[#5a5a7e] transition-colors" : "hidden"}"
        ></div>

        <div data-selected-run class="${hasResults ? "flex-1 min-h-[16rem] overflow-hidden" : "flex-1 min-h-0 overflow-hidden"}">
          ${selectedRunPlaceholderHTML(busy, progress)}
        </div>
      </div>
    </div>
  `
}

export function selectedRunPlaceholderHTML(busy: boolean, progress: ResearchProgressInfo | null = null): string {
  if (busy) {
    const width = progress && progress.percent > 0 ? Math.max(6, progress.percent) : 0
    const cancelling = progress?.cancelling === true

    return `
      <div class="flex items-center justify-center h-full p-6">
        <div class="w-full max-w-md rounded-xl border border-[${BORDER_COLOR}] bg-[${BG_SURFACE}] p-4 text-center">
          <div class="flex items-center justify-between gap-2">
            <div class="flex-1 text-sm font-medium text-white">${progress?.title || "Running research"}</div>
            ${cancelling
              ? `<span class="text-xs text-amber-400 shrink-0">Cancelling…</span>`
              : `<button
                   type="button"
                   data-action="click->research#cancelRun"
                   title="Stop optimization"
                   class="shrink-0 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-white hover:bg-red-500/20 transition-colors cursor-pointer"
                 >✕</button>`
            }
          </div>
          <div class="mt-2 text-sm text-gray-300">${progress?.detail || "Waiting for server response…"}</div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-[${BG_INPUT}]">
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

type PaneArgs = {
  pane: ResearchTopPaneKey
  expandedPane: ResearchTopPaneKey | null
  showOptimization: boolean
  state: ResearchConfig
  withBorder: boolean
}

function researchPaneHTML({ pane, expandedPane, showOptimization, state, withBorder }: PaneArgs): string {
  if (!showOptimization && pane !== "equity") return ""

  const titles: Record<ResearchTopPaneKey, { title: string; subtitle: string }> = {
    equity: {
      title: "Equity",
      subtitle: "Selected run equity curve",
    },
    optimization_chart: {
      title: "Optimization runs",
      subtitle: metricLabel(state.selectedMetric),
    },
    optimization_table: {
      title: "Optimization table",
      subtitle: "Sortable optimization results",
    },
  }

  const targets: Record<ResearchTopPaneKey, string> = {
    equity: "data-selected-run-equity",
    optimization_chart: "data-optimization-chart",
    optimization_table: "data-runs-grid",
  }

  return `
    <section class="flex-1 min-w-0 min-h-0 flex flex-col ${withBorder ? `border-r border-[${BG_HOVER}]` : ""}">
      <div class="flex items-center justify-between gap-3 px-3 py-2 bg-[${BG_SURFACE}] border-b border-[${BG_HOVER}]">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-wide text-gray-500">${titles[pane].title}</div>
          <div class="text-xs text-gray-400 truncate">${titles[pane].subtitle}</div>
        </div>
        ${showOptimization ? topPaneToggleButtonHTML(pane, expandedPane === pane) : ""}
      </div>
      <div class="flex-1 min-h-0 p-3">
        <div ${targets[pane]} class="h-full min-h-[14rem]"></div>
      </div>
    </section>
  `
}

function topPaneToggleButtonHTML(pane: ResearchTopPaneKey, expanded: boolean): string {
  return `
    <button
      type="button"
      data-pane-key="${pane}"
      data-action="click->research#toggleTopPaneExpand"
      class="shrink-0 w-8 h-8 flex items-center justify-center rounded border border-[#2a2a3e] text-gray-400 hover:text-white hover:bg-[#1a1a2e] cursor-pointer"
      title="${expanded ? "Collapse panel" : "Expand panel"}"
    >${expanded ? "↙" : "↗"}</button>
  `
}

function resolveExpandedPane(
  pane: ResearchTopPaneKey | null | undefined,
  showOptimization: boolean,
): ResearchTopPaneKey | null {
  if (pane === "equity") return pane
  if (showOptimization && (pane === "optimization_chart" || pane === "optimization_table")) return pane
  return null
}
