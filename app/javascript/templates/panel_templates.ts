import { OVERLAY_COLORS } from "../config/theme"
import { escapeHTML } from "../utils/dom"
import type { Panel } from "../types/store"

export function panelLegendHTML(panel: Panel): string {
  const timeframe = panel.timeframe || "1m"
  const lines = panel.overlays
    .filter(o => o.symbol)
    .map(o => {
      const colors = OVERLAY_COLORS[o.colorScheme] || OVERLAY_COLORS[0]
      const swatches = `<span class="inline-flex items-center gap-0.5 shrink-0">${colorSwatch(colors.up)}${colorSwatch(colors.down)}</span>`
      if (o.mode === "indicator" && o.indicatorType) {
        const sourceOverlay = o.pinnedTo ? panel.overlays.find(s => s.id === o.pinnedTo) : null
        const sourceSymbol = escapeHTML(sourceOverlay ? sourceOverlay.symbol : o.symbol)
        const sourceMode = sourceOverlay ? (sourceOverlay.mode === "volume" ? "Volume" : "Price") : "Price"
        const paramsStr = o.indicatorParams ? Object.values(o.indicatorParams).join(",") : ""
        const modeLabel = `${(o.indicatorType || "").toUpperCase()}${paramsStr ? `(${paramsStr})` : ""}`
        return `<div class="flex items-center gap-1.5 truncate">${swatches} ${sourceSymbol} ${sourceMode} ${modeLabel} ${timeframe}</div>`
      }
      const symbol = escapeHTML(o.symbol)
      const modeLabel = o.mode === "volume" ? "Volume" : "Price"
      return `<div class="flex items-center gap-1.5 truncate">${swatches} ${symbol} ${modeLabel} ${timeframe}</div>`
    })
    .join("")

  if (!lines) return ""

  return `
    <div class="absolute top-2 left-3 z-10 max-w-[72%] pointer-events-none flex flex-col gap-0.5 text-base font-medium text-gray-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]">
      ${lines}
    </div>
  `
}

function colorSwatch(color: string): string {
  return `<span class="w-3 h-3 rounded-sm border border-black/20" style="background:${color}"></span>`
}

export function controlButtonsHTML(
  ctrl: string,
  panelId: string,
  isFirst: boolean,
  isLast: boolean
): string {
  const btnClass = "w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white bg-[#1a1a2e]/85 hover:bg-[#2a2a3e] rounded text-base cursor-pointer"

  const upBtn = isFirst ? "" : `
    <button data-move-panel data-panel-id="${panelId}"
            data-action="click->${ctrl}#movePanelUp"
            class="${btnClass}" title="Move up">&#9650;</button>`

  const downBtn = isLast ? "" : `
    <button data-move-panel data-panel-id="${panelId}"
            data-action="click->${ctrl}#movePanelDown"
            class="${btnClass}" title="Move down">&#9660;</button>`

  const closeBtn = `
    <button data-close-panel="${panelId}"
            data-action="click->${ctrl}#removePanel"
            class="${btnClass} hover:!text-red-300" title="Remove panel">&times;</button>`

  return `
    <div class="absolute top-1 right-1 z-10 flex gap-0.5">
      ${upBtn}${downBtn}${closeBtn}
    </div>
  `
}

export function emptyPanelHTML(
  ctrl: string,
  panelId: string,
  borderClass: string,
  buttonsHTML: string
): string {
  return `
    <div data-panel-id="${panelId}"
         data-action="click->${ctrl}#selectPanel"
         class="relative flex-1 min-h-0 border ${borderClass} flex items-center justify-center cursor-pointer">
      ${buttonsHTML}
      <span class="text-gray-500 text-base">Select a symbol</span>
    </div>
  `
}

export function chartPanelHTML(
  ctrl: string,
  panelId: string,
  borderClass: string,
  buttonsHTML: string,
  overlaysJson: string,
  timeframe: string,
  structuralKey: string,
  legendHTML: string
): string {
  return `
    <div data-panel-id="${panelId}"
         data-action="click->${ctrl}#selectPanel"
         class="relative flex-1 min-h-0 border ${borderClass} cursor-pointer">
      ${buttonsHTML}
      <div
        data-controller="chart"
        data-chart-timeframe-value="${timeframe}"
        data-chart-overlays-value='${overlaysJson.replace(/'/g, "&#39;")}'
        data-chart-structural-key="${structuralKey}"
        class="absolute inset-0"
      ></div>
      ${legendHTML}
    </div>
  `
}

export function tabButtonHTML(
  ctrl: string,
  tabId: string,
  label: string,
  isActive: boolean,
  canRemove: boolean,
  tabType: string = "chart",
  insideGroup: boolean = false,
): string {
  const contextMenu = tabType === "chart"
    ? `<span
         data-action="click->${ctrl}#createDataFromChart"
         title="Create Data tab from this chart"
         class="ml-0.5 inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-green-300 hover:bg-green-500/10 text-xs leading-none cursor-pointer"
       >&#9638;</span>`
    : ""

  const dropActions = insideGroup ? "" : ` dragover->${ctrl}#tabDragOver dragleave->${ctrl}#tabDragLeave drop->${ctrl}#tabDrop`
  const dragHandle = insideGroup
    ? ""
    : `<span
        class="tab-drag-handle inline-flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 hover:bg-white/10"
        draggable="true"
        data-action="click->${ctrl}#tabDragHandleClick dragstart->${ctrl}#tabDragStart dragend->${ctrl}#tabDragEnd"
        title="Drag to reorder"
      >&#8942;</span>`

  return `
    <button
      type="button"
      data-tab-id="${tabId}"
      data-drag-tab-id="${tabId}"
      data-tab-type="${tabType}"
      data-action="click->${ctrl}#switchTab${dropActions}"
      class="flex items-center gap-1 px-4 py-2 text-base font-medium cursor-pointer whitespace-nowrap
             ${isActive
               ? "text-white border-b-2 border-blue-400"
               : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"}"
    >
      ${dragHandle}
      <span
        data-tab-label
        data-action="dblclick->${ctrl}#startRename"
        title="Double-click to rename tab"
      >${label}</span>
      ${isActive ? contextMenu : ""}
      ${canRemove ? `
        <span
          data-action="click->${ctrl}#removeTab"
          title="Remove tab"
          class="ml-0.5 inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none"
        >&times;</span>
      ` : ""}
    </button>
  `
}

export function addTabButtonHTML(ctrl: string): string {
  return `
    <div class="relative inline-flex" data-tab-type-menu>
      <button
        data-action="click->${ctrl}#toggleAddTabMenu"
        class="px-3 py-2 text-gray-400 hover:text-white text-2xl leading-none cursor-pointer"
        title="Add new tab"
      >+</button>
      <div data-tab-type-dropdown class="hidden absolute top-full left-0 z-50 mt-1 py-1 bg-[#22223a] border border-[#3a3a4e] rounded shadow-xl min-w-[140px]">
        <button
          data-action="click->${ctrl}#addChartTab"
          class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2a2a3e] hover:text-white cursor-pointer flex items-center gap-2"
        >
          <span class="text-blue-400">&#9636;</span> Chart
        </button>
        <button
          data-action="click->${ctrl}#addDataTab"
          class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2a2a3e] hover:text-white cursor-pointer flex items-center gap-2"
        >
          <span class="text-green-400">&#9638;</span> Data
        </button>
      </div>
    </div>
  `
}

export function dataGridPanelHTML(
  ctrl: string,
  configJson: string,
): string {
  return `
    <div class="relative flex-1 min-h-0">
      <div class="absolute inset-0"
           data-controller="data-grid"
           data-data-grid-config-value='${configJson.replace(/'/g, "&#39;")}'>
      </div>
    </div>
  `
}

export function systemStatsPanelHTML(
  systemId: string,
  dataTabId: string,
): string {
  return `
    <div class="relative flex-1 min-h-0 overflow-hidden"
         data-controller="system-stats"
         data-system-stats-system-id-value="${systemId}"
         data-system-stats-data-tab-id-value="${dataTabId}">
    </div>
  `
}
