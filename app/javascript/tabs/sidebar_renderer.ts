import { formatPrice, formatDateTime } from "../utils/format"
import { escapeHTML } from "../utils/dom"
import { drawingListHTML } from "../templates/drawing_templates"
import { DEFAULT_LINE_COLOR, DEFAULT_GUIDE_COLOR, DEFAULT_LABEL_COLOR } from "../config/constants"
import {
  collapseBtnHTML, modeBtnHTML, toggleBtnHTML, opacitySliderHTML,
  chartTypeOptsHTML, colorSchemeDropdownHTML, comboHTML,
  overlayItemHTML, indicatorSettingsHTML,
} from "../templates/sidebar_templates"
import type { Panel, Overlay, DrawingItem } from "../types/store"

const LINE_COLOR_INDICATOR = (item: DrawingItem, color: string, width: number): string =>
  `<span class="block rounded-sm border border-black/20" style="background:${escapeHTML(color)};width:${width * 4}px;height:${width * 2}px"></span>`

export default class SidebarRenderer {
  sidebarEl: HTMLElement
  ctrl: string
  indicatorFilter: "all" | "client" | "server" = "all"
  chartsCollapsed: boolean
  labelsCollapsed: boolean
  textCollapsed: boolean
  trendLinesCollapsed: boolean
  hlinesCollapsed: boolean
  vlinesCollapsed: boolean
  indicators: Array<{ key: string }> = []

  constructor(sidebarEl: HTMLElement, controllerName: string) {
    this.sidebarEl = sidebarEl
    this.ctrl = controllerName
    this.indicatorFilter = "all"
    this.chartsCollapsed = false
    this.labelsCollapsed = false
    this.textCollapsed = false
    this.trendLinesCollapsed = false
    this.hlinesCollapsed = false
    this.vlinesCollapsed = false
  }

  render(panel: Panel | null, selectedOverlayId: string | null, symbols: string[], timeframes: string[], indicators: unknown[], labelModeActive: boolean, lineModeActive: boolean, vpEnabled: boolean, vpOpacity: number, hlModeActive: boolean, vlModeActive: boolean): void {
    this.indicators = Array.isArray(indicators) ? (indicators as Array<{ key: string }>) : []

    if (!panel) {
      this.sidebarEl.innerHTML = ""
      return
    }

    const selectedOverlay = panel.overlays.find(o => o.id === selectedOverlayId) || panel.overlays[0]
    const mode = selectedOverlay?.mode || "price"

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-4 text-base">
        ${this._panelHeaderHTML(panel.timeframe || "1m", timeframes)}

        <hr class="border-[#3a3a4e]">

        ${this._chartsSectionHTML(panel, selectedOverlay, symbols, mode)}

        <hr class="border-[#3a3a4e]">

        ${this._volumeProfileHTML(vpEnabled, vpOpacity)}

        <hr class="border-[#3a3a4e]">

        ${this._drawingSectionHTML(panel, labelModeActive, lineModeActive, hlModeActive, vlModeActive)}
      </div>
    `
  }

  _panelHeaderHTML(currentTimeframe: string, timeframes: string[]): string {
    return `
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500 uppercase tracking-wide">Panel Settings</span>
        <button
          data-action="click->${this.ctrl}#addPanel"
          class="text-sm text-gray-400 hover:text-white cursor-pointer"
          title="Add panel below"
        >+ Panel</button>
      </div>

      <label class="flex flex-col gap-1 text-sm text-gray-400">
        Timeframe
        ${comboHTML(this.ctrl, "timeframe", timeframes, currentTimeframe, "w-full")}
      </label>
    `
  }

  _chartsSectionHTML(panel: Panel, selectedOverlay: Overlay | undefined, symbols: string[], mode: string): string {
    const overlayList = panel.overlays
      .map((o, idx) => overlayItemHTML(this.ctrl, o, o.id === selectedOverlay?.id, panel, idx === 0))
      .join("")
    const isPrimary = selectedOverlay && panel.overlays[0]?.id === selectedOverlay.id

    return `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          ${collapseBtnHTML(this.ctrl, "toggleChartsSection", this.chartsCollapsed)}
          <span class="text-sm text-gray-500 uppercase tracking-wide cursor-pointer"
                data-action="click->${this.ctrl}#toggleChartsSection">Charts</span>
        </div>
        <button
          data-action="click->${this.ctrl}#addOverlay"
          class="text-sm text-gray-400 hover:text-white cursor-pointer"
          title="Add chart"
        >+ Chart</button>
      </div>

      ${this.chartsCollapsed ? "" : `
        <div class="flex flex-col gap-0.5">${overlayList}</div>
        <hr class="border-[#3a3a4e]">
        ${this._selectedChartHTML(panel, selectedOverlay, symbols, mode, isPrimary)}
      `}
    `
  }

  _selectedChartHTML(panel: Panel, selectedOverlay: Overlay | undefined, symbols: string[], mode: string, isPrimary = false): string {
    const currentSymbol = selectedOverlay?.symbol || ""
    const chartType = selectedOverlay?.chartType || "Candlestick"
    const colorScheme = selectedOverlay?.colorScheme ?? 0
    const opacity = typeof selectedOverlay?.opacity === "number" ? selectedOverlay.opacity : 1
    const opacityPercent = Math.round(Math.max(0, Math.min(1, opacity)) * 100)

    const priceActive = mode === "price"
    const volumeActive = mode === "volume"
    const indicatorActive = mode === "indicator"
    const indicatorType = selectedOverlay?.indicatorType || "sma"
    const indicatorParams = selectedOverlay?.indicatorParams || {}

    const chartTypeOptions = priceActive
      ? chartTypeOptsHTML([
          ["Candlestick", "Candles"], ["Bar", "Bars"], ["Line", "Line"],
          ["Area", "Area"], ["Baseline", "Baseline"],
        ], chartType)
      : chartTypeOptsHTML([
          ["Histogram", "Bars"], ["Line", "Line"], ["Area", "Area"],
        ], chartType)

    return `
      <div class="text-sm text-gray-500 uppercase tracking-wide">Selected Chart</div>

      ${!indicatorActive ? `
        <label class="flex flex-col gap-1 text-sm text-gray-400">
          Symbol
          ${comboHTML(this.ctrl, "symbol", symbols, currentSymbol, "w-full")}
        </label>
      ` : ""}

      <div class="flex flex-col gap-1 text-sm text-gray-400">
        <span>Color scheme</span>
        ${colorSchemeDropdownHTML(this.ctrl, colorScheme)}
      </div>

      ${opacitySliderHTML(opacityPercent, `${this.ctrl}#adjustOverlayOpacity`, "Opacity", "data-opacity-value")}

      ${!isPrimary ? `
      <div class="flex gap-1">
        ${modeBtnHTML(this.ctrl, "price", "Price", priceActive)}
        ${modeBtnHTML(this.ctrl, "volume", "Volume", volumeActive)}
        ${modeBtnHTML(this.ctrl, "indicator", "Indicator", indicatorActive)}
      </div>
      ` : ""}

      ${indicatorActive ? indicatorSettingsHTML(this.ctrl, indicatorType, indicatorParams, selectedOverlay, panel, this.indicators, this.indicatorFilter) : `
        <label class="flex flex-col gap-1 text-sm text-gray-400">
          Chart type
          <select
            data-field="chartType"
            data-action="change->${this.ctrl}#switchChartType"
            class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
          >${chartTypeOptions}</select>
        </label>
      `}

      <button
        data-action="click->${this.ctrl}#applySettings"
        class="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
      >Apply</button>
    `
  }

  _volumeProfileHTML(vpEnabled: boolean, vpOpacity: number): string {
    return `
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500 uppercase tracking-wide">Volume Profile</span>
        ${toggleBtnHTML(this.ctrl, "toggleVolumeProfile", vpEnabled ? "On" : "Off", vpEnabled)}
      </div>

      ${vpEnabled ? opacitySliderHTML(
        Math.round((vpOpacity ?? 0.3) * 100),
        `${this.ctrl}#adjustVpOpacity`,
        "VP Opacity",
        "data-vp-opacity-value"
      ) : ""}
    `
  }

  _drawingSectionHTML(panel: Panel, labelModeActive: boolean, lineModeActive: boolean, hlModeActive: boolean, vlModeActive: boolean): string {
    const toolButtons = (
      [
        ["toggleLabelMode", "Text", labelModeActive],
        ["toggleLineMode", "Line", lineModeActive],
        ["toggleHLineMode", "HL", hlModeActive],
        ["toggleVLineMode", "VL", vlModeActive],
      ] as [string, string, boolean][]
    ).map(([action, label, isActive]) =>
      toggleBtnHTML(this.ctrl, action, label, isActive)
    ).join("")

    return `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          ${collapseBtnHTML(this.ctrl, "toggleLabelsSection", this.labelsCollapsed)}
          <span class="text-sm text-gray-500 uppercase tracking-wide cursor-pointer"
                data-action="click->${this.ctrl}#toggleLabelsSection">Labels</span>
        </div>
        <span class="flex gap-1">
          ${toolButtons}
          <button data-action="click->${this.ctrl}#clearAllLabels"
                  class="text-sm px-2 py-1 rounded cursor-pointer text-gray-400 bg-[#2a2a3e] hover:bg-red-500/20 hover:text-red-300"
                  title="Clear all labels, lines, HL, VL on this panel">
            Clear
          </button>
        </span>
      </div>

      ${this.labelsCollapsed ? "" : [
        this._labelListHTML(panel.labels || []),
        this._lineListHTML(panel.lines || []),
        this._hlineListHTML(panel.hlines || []),
        this._vlineListHTML(panel.vlines || []),
      ].join("")}
    `
  }

  _labelListHTML(labels: DrawingItem[]): string {
    return drawingListHTML({
      items: labels, kind: "labels", controllerName: this.ctrl,
      collapsed: this.textCollapsed, toggleAction: "toggleTextSublist",
      clearAction: "clearAllText", headerLabel: "Text",
      nameFn: (l) => String(l.text ?? l.id),
      subtextFn: (l) => {
        const symbol = String(l.symbol ?? "")
        const modeStr = String(l.modeDetail ?? (l.mode === "volume" ? "Vol" : l.mode === "indicator" ? "Ind" : "Price"))
        const priceStr = l.price != null ? formatPrice(Number(l.price)) : ""
        const tf = String(l.timeframe ?? "")
        return [symbol, modeStr, priceStr, tf].filter(Boolean).join(" ")
      },
      timeFn: (l) => formatDateTime(l.time != null ? Number(l.time) : null),
      defaultColor: DEFAULT_LABEL_COLOR, defaultWidth: 1,
      hasWidthPicker: false, hasFontSizePicker: true,
    })
  }

  _lineListHTML(lines: DrawingItem[]): string {
    return drawingListHTML({
      items: lines, kind: "lines", controllerName: this.ctrl,
      collapsed: this.trendLinesCollapsed, toggleAction: "toggleTrendLinesSublist",
      clearAction: "clearAllLines", headerLabel: "Lines", mt: true,
      nameFn: (l) => String(l.name ?? l.id),
      subtextFn: (l) => {
        const symbol = String(l.symbol ?? "")
        const modeStr = String(l.modeDetail ?? (l.mode === "volume" ? "Vol" : "Price"))
        const p1 = l.p1 as { price?: number; time?: number } | undefined
        const p2 = l.p2 as { price?: number; time?: number } | undefined
        const p1Str = p1?.price != null ? formatPrice(p1.price) : "?"
        const p2Str = p2?.price != null ? formatPrice(p2.price) : "?"
        const tf = String(l.timeframe ?? "")
        return [symbol, modeStr, `${p1Str} \u2192 ${p2Str}`, tf].filter(Boolean).join(" ")
      },
      timeFn: (l) => {
        const p1 = l.p1 as { time?: number } | undefined
        const p2 = l.p2 as { time?: number } | undefined
        return `${formatDateTime(p1?.time != null ? Number(p1.time) : null)} \u2014 ${formatDateTime(p2?.time != null ? Number(p2.time) : null)}`
      },
      defaultColor: DEFAULT_LINE_COLOR, defaultWidth: 2,
      hasWidthPicker: true, hasFontSizePicker: false,
      colorIndicatorFn: LINE_COLOR_INDICATOR,
    })
  }

  _hlineListHTML(hlines: DrawingItem[]): string {
    return drawingListHTML({
      items: hlines, kind: "hlines", controllerName: this.ctrl,
      collapsed: this.hlinesCollapsed, toggleAction: "toggleHLinesSublist",
      clearAction: "clearAllHLines", headerLabel: "Horizontal", mt: true,
      hasSelect: false,
      nameFn: (hl) => String(hl.name ?? hl.id),
      subtextFn: (hl) => {
        const symbol = String(hl.symbol ?? "")
        const modeStr = String(hl.modeDetail ?? "Price")
        const priceStr = hl.price != null ? formatPrice(Number(hl.price)) : "?"
        const tf = String(hl.timeframe ?? "")
        return [symbol, modeStr, priceStr, tf].filter(Boolean).join(" ")
      },
      defaultColor: DEFAULT_GUIDE_COLOR, defaultWidth: 1,
      hasWidthPicker: true, hasFontSizePicker: false,
      colorIndicatorFn: LINE_COLOR_INDICATOR,
    })
  }

  _vlineListHTML(vlines: DrawingItem[]): string {
    return drawingListHTML({
      items: vlines, kind: "vlines", controllerName: this.ctrl,
      collapsed: this.vlinesCollapsed, toggleAction: "toggleVLinesSublist",
      clearAction: "clearAllVLines", headerLabel: "Vertical", mt: true,
      nameFn: (vl) => String(vl.name ?? vl.id),
      timeFn: (vl) => {
        const tf = String(vl.timeframe ?? "")
        return [formatDateTime(vl.time != null ? Number(vl.time) : null), tf].filter(Boolean).join(" ")
      },
      defaultColor: DEFAULT_GUIDE_COLOR, defaultWidth: 1,
      hasWidthPicker: true, hasFontSizePicker: false,
      colorIndicatorFn: LINE_COLOR_INDICATOR,
    })
  }
}
