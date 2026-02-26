import { OVERLAY_COLORS } from "../chart/theme"
import { INDICATOR_META } from "../chart/indicators"

const INDICATOR_FILTERS = ["all", "client", "server"]
const INDICATOR_FILTER_LABELS = { all: "All", client: "\u26A1 Client", server: "\uD83C\uDF10 Server" }

export default class SidebarRenderer {
  constructor(sidebarEl, controllerName) {
    this.sidebarEl = sidebarEl
    this.controllerName = controllerName
    this.indicatorFilter = "all"
    this.chartsCollapsed = false
    this.labelsCollapsed = false
  }

  render(panel, selectedOverlayId, symbols, timeframes, indicators, labelModeActive) {
    this.indicators = indicators || []

    if (!panel) {
      this.sidebarEl.innerHTML = ""
      return
    }

    const currentTimeframe = panel.timeframe || "1m"
    const selectedOverlay = panel.overlays.find(o => o.id === selectedOverlayId) || panel.overlays[0]
    const currentSymbol = selectedOverlay?.symbol || ""
    const mode = selectedOverlay?.mode || "price"
    const chartType = selectedOverlay?.chartType || "Candlestick"
    const colorScheme = selectedOverlay?.colorScheme ?? 0
    const opacity = typeof selectedOverlay?.opacity === "number" ? selectedOverlay.opacity : 1
    const opacityPercent = Math.round(Math.max(0, Math.min(1, opacity)) * 100)

    const priceActive = mode === "price"
    const volumeActive = mode === "volume"
    const indicatorActive = mode === "indicator"
    const activeBtnClass = "text-white bg-blue-600"
    const inactiveBtnClass = "text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e]"

    const indicatorType = selectedOverlay?.indicatorType || "sma"
    const indicatorParams = selectedOverlay?.indicatorParams || {}

    const chartTypeOptions = priceActive
      ? this._chartTypeOpts([
          ["Candlestick", "Candles"], ["Bar", "Bars"], ["Line", "Line"],
          ["Area", "Area"], ["Baseline", "Baseline"],
        ], chartType)
      : this._chartTypeOpts([
          ["Histogram", "Bars"], ["Line", "Line"], ["Area", "Area"],
        ], chartType)
    const colorSchemeDropdown = this._colorSchemeDropdown(colorScheme)

    // Overlay list
    const overlayList = panel.overlays.map(o => {
      const isSelected = o.id === (selectedOverlay?.id)
      let label, modeLabel
      if (o.mode === "indicator") {
        const sourceOverlay = o.pinnedTo ? panel.overlays.find(s => s.id === o.pinnedTo) : null
        const sourceSymbol = sourceOverlay ? sourceOverlay.symbol : o.symbol
        const sourceMode = sourceOverlay ? (sourceOverlay.mode === "volume" ? "Vol" : "Price") : "Price"
        label = `${sourceSymbol || o.symbol || "Empty"} ${sourceMode}`
        const paramsStr = o.indicatorParams
          ? Object.values(o.indicatorParams).join(", ")
          : ""
        modeLabel = (o.indicatorType || "ind").toUpperCase() + (paramsStr ? ` ${paramsStr}` : "")
      } else {
        label = o.symbol || "Empty"
        modeLabel = !o.symbol ? "" : (o.mode === "volume" ? "Volume" : "Price")
      }
      const visibilityClass = o.visible === false ? "bg-gray-600" : "bg-emerald-400"
      const visibilityTitle = o.visible === false ? "Hidden" : "Visible"
      return `
        <div class="flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer text-sm
                    ${isSelected ? "bg-blue-600/30 text-white" : "text-gray-400 hover:bg-[#2a2a3e]"}"
             data-overlay-id="${o.id}"
             data-action="click->${this.controllerName}#selectOverlay">
          <div class="flex-1 min-w-0 flex items-center gap-1.5">
            <span class="truncate">${label}</span>
            ${modeLabel ? `<span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded border text-xs leading-none
                         ${isSelected ? "text-blue-200 border-blue-300/40 bg-blue-500/10" : "text-gray-400 border-gray-500/40 bg-[#2a2a3e]"}">${modeLabel}</span>` : ""}
          </div>
          <button
            type="button"
            data-action="click->${this.controllerName}#toggleOverlayVisibility"
            data-overlay-id="${o.id}"
            data-toggle-overlay-visibility
            class="inline-flex w-6 h-6 items-center justify-center rounded shrink-0 hover:bg-[#2a2a3e] cursor-pointer"
            title="Toggle visibility"
            aria-label="Toggle visibility"
          >
            <span class="w-2.5 h-2.5 rounded-full ${visibilityClass}" title="${visibilityTitle}" aria-hidden="true"></span>
          </button>
          ${panel.overlays.length > 1 ? `
            <span data-action="click->${this.controllerName}#removeOverlay"
                  data-remove-overlay="${o.id}"
                  title="Remove chart"
                  class="inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none">&times;</span>
          ` : ""}
        </div>
      `
    }).join("")

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-4 text-base">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500 uppercase tracking-wide">Panel Settings</span>
          <button
            data-action="click->${this.controllerName}#addPanel"
            class="text-sm text-gray-400 hover:text-white cursor-pointer"
            title="Add panel below"
          >+ Panel</button>
        </div>

        <label class="flex flex-col gap-1 text-sm text-gray-400">
          Timeframe
          ${this._comboHTML("timeframe", timeframes, currentTimeframe, "w-full")}
        </label>

        <hr class="border-[#3a3a4e]">

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <button
              data-action="click->${this.controllerName}#toggleChartsSection"
              class="text-blue-400 hover:text-blue-300 text-base cursor-pointer select-none w-6 h-6 flex items-center justify-center"
              title="${this.chartsCollapsed ? "Expand" : "Collapse"}"
            >${this.chartsCollapsed ? "&#9656;" : "&#9662;"}</button>
            <span class="text-sm text-gray-500 uppercase tracking-wide cursor-pointer"
                  data-action="click->${this.controllerName}#toggleChartsSection">Charts</span>
          </div>
          <button
            data-action="click->${this.controllerName}#addOverlay"
            class="text-sm text-gray-400 hover:text-white cursor-pointer"
            title="Add chart"
          >+ Chart</button>
        </div>

        ${this.chartsCollapsed ? "" : `
          <div class="flex flex-col gap-0.5">${overlayList}</div>

          <hr class="border-[#3a3a4e]">

          <div class="text-sm text-gray-500 uppercase tracking-wide">Selected Chart</div>

          ${!indicatorActive ? `
            <label class="flex flex-col gap-1 text-sm text-gray-400">
              Symbol
              ${this._comboHTML("symbol", symbols, currentSymbol, "w-full")}
            </label>
          ` : ""}

          <div class="flex flex-col gap-1 text-sm text-gray-400">
            <span>Color scheme</span>
            ${colorSchemeDropdown}
          </div>

          <label class="flex flex-col gap-1 text-sm text-gray-400">
            <span class="flex items-center justify-between">
              <span>Opacity</span>
              <span data-opacity-value class="text-gray-400">${opacityPercent}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value="${opacityPercent}"
              data-action="input->${this.controllerName}#adjustOverlayOpacity change->${this.controllerName}#adjustOverlayOpacity"
              class="w-full accent-blue-500 cursor-pointer"
            >
          </label>

          <div class="flex gap-1">
            <button
              data-action="click->${this.controllerName}#setMode"
              data-mode="price"
              class="flex-1 px-2 py-2 text-sm rounded cursor-pointer ${priceActive ? activeBtnClass : inactiveBtnClass}"
            >Price</button>
            <button
              data-action="click->${this.controllerName}#setMode"
              data-mode="volume"
              class="flex-1 px-2 py-2 text-sm rounded cursor-pointer ${volumeActive ? activeBtnClass : inactiveBtnClass}"
            >Volume</button>
            <button
              data-action="click->${this.controllerName}#setMode"
              data-mode="indicator"
              class="flex-1 px-2 py-2 text-sm rounded cursor-pointer ${indicatorActive ? activeBtnClass : inactiveBtnClass}"
            >Indicator</button>
          </div>

          ${indicatorActive ? this._indicatorSettingsHTML(indicatorType, indicatorParams, selectedOverlay, panel) : `
            <label class="flex flex-col gap-1 text-sm text-gray-400">
              Chart type
              <select
                data-field="chartType"
                data-action="change->${this.controllerName}#switchChartType"
                class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
              >${chartTypeOptions}</select>
            </label>
          `}

          <button
            data-action="click->${this.controllerName}#applySettings"
            class="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
          >Apply</button>
        `}

        <hr class="border-[#3a3a4e]">

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <button
              data-action="click->${this.controllerName}#toggleLabelsSection"
              class="text-blue-400 hover:text-blue-300 text-base cursor-pointer select-none w-6 h-6 flex items-center justify-center"
              title="${this.labelsCollapsed ? "Expand" : "Collapse"}"
            >${this.labelsCollapsed ? "&#9656;" : "&#9662;"}</button>
            <span class="text-sm text-gray-500 uppercase tracking-wide cursor-pointer"
                  data-action="click->${this.controllerName}#toggleLabelsSection">Labels</span>
          </div>
          <button data-action="click->${this.controllerName}#toggleLabelMode"
                  class="text-sm px-2 py-1 rounded cursor-pointer ${labelModeActive ? activeBtnClass : inactiveBtnClass}">
            Text
          </button>
        </div>

        ${this.labelsCollapsed ? "" : this._labelListHTML(panel.labels || [])}
      </div>
    `
  }

  _labelListHTML(labels) {
    if (labels.length === 0) return ""
    return `
      <div class="flex flex-col gap-0.5">
        ${labels.map(label => {
          const symbol = label.symbol || ""
          const modeStr = label.modeDetail || (label.mode === "volume" ? "Vol" : label.mode === "indicator" ? "Ind" : "Price")
          const priceStr = label.price != null ? this._formatPrice(label.price) : ""
          const anchor = [symbol, modeStr, priceStr].filter(Boolean).join(" ")
          const timeStr = this._formatLabelTime(label.time)
          return `
          <div class="group flex items-center gap-2 px-2.5 py-1.5 rounded text-[15px] text-gray-400 hover:bg-[#2a2a3e] cursor-pointer"
               data-action="click->${this.controllerName}#selectLabel dblclick->${this.controllerName}#startLabelRename"
               data-label-id="${label.id}">
            <div class="flex-1 min-w-0 flex flex-col">
              <span class="truncate" data-label-text="${label.id}">${this._escapeHTML(label.text)}</span>
              <span class="text-[13px] text-gray-500 truncate">${this._escapeHTML(anchor)}</span>
              <span class="text-[13px] text-gray-600 truncate">${this._escapeHTML(timeStr)}</span>
            </div>
            <span data-action="click->${this.controllerName}#removeLabel"
                  data-remove-label="${label.id}"
                  title="Remove label"
                  class="hidden group-hover:inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none">&times;</span>
          </div>
        `}).join("")}
      </div>
    `
  }

  _formatPrice(price) {
    if (price >= 1000) return price.toFixed(0)
    if (price >= 1) return price.toFixed(2)
    return price.toPrecision(4)
  }

  _formatLabelTime(time) {
    if (!time) return ""
    const d = new Date(time * 1000)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const hours = String(d.getHours()).padStart(2, "0")
    const minutes = String(d.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  _indicatorSettingsHTML(indicatorType, indicatorParams, selectedOverlay, panel) {
    const indicators = this.indicators || []
    const meta = INDICATOR_META[indicatorType]

    const allKeys = indicators.length > 0
      ? indicators.map(i => i.key)
      : Object.keys(INDICATOR_META)

    const indicatorKeys = allKeys.filter(key => {
      if (this.indicatorFilter === "all") return true
      const m = INDICATOR_META[key]
      return this.indicatorFilter === "client" ? !!m?.lib : !m?.lib
    })

    const indicatorOpts = indicatorKeys.map(key => {
      const m = INDICATOR_META[key]
      const label = m?.label || key.toUpperCase()
      const icon = m?.lib ? "\u26A1" : "\uD83C\uDF10"
      return `<option value="${key}"${key === indicatorType ? " selected" : ""}>${icon} ${label}</option>`
    }).join("")

    const filterLabel = INDICATOR_FILTER_LABELS[this.indicatorFilter]

    let paramInputs = ""
    if (meta && meta.defaults) {
      const params = { ...meta.defaults, ...indicatorParams }
      paramInputs = Object.entries(meta.defaults).map(([key, defaultVal]) => {
        const value = params[key] ?? defaultVal
        const label = meta.paramLabels?.[key] || key
        return `
          <label class="flex flex-col gap-1 text-sm text-gray-400">
            ${this._escapeHTML(label)}
            <input
              type="number"
              data-indicator-param="${key}"
              value="${value}"
              data-action="keydown->${this.controllerName}#applyIndicatorOnEnter"
              class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
            >
          </label>
        `
      }).join("")
    }

    const pinnedTo = selectedOverlay?.pinnedTo || null
    const requires = meta?.requires || "values"
    const pinTargets = panel.overlays.filter(o => {
      if (o.id === selectedOverlay?.id || !o.symbol) return false
      if (requires === "values") return true
      return o.mode === "price"
    })
    const sourceOpts = pinTargets.map(o => {
      const modeLabel = o.mode === "volume" ? "Vol" : (o.mode === "indicator" ? (o.indicatorType || "").toUpperCase() : "Price")
      return `<option value="${o.id}"${o.id === pinnedTo ? " selected" : ""}>${this._escapeHTML(o.symbol)} ${modeLabel}</option>`
    }).join("")

    const sourceHTML = `
      <label class="flex flex-col gap-1 text-sm text-gray-400">
        Source
        <select
          data-field="pinnedTo"
          data-action="change->${this.controllerName}#changePinnedTo"
          class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >${pinTargets.length > 0 ? sourceOpts : '<option value="" disabled selected>No charts on panel</option>'}</select>
      </label>
    `

    return `
      <div class="flex flex-col gap-1 text-sm text-gray-400">
        <span>Indicator</span>
        <div class="flex gap-1 items-stretch">
          <select
            data-field="indicatorType"
            data-action="change->${this.controllerName}#switchIndicatorType"
            class="flex-1 min-w-0 px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
          >${indicatorOpts}</select>
          <button
            data-action="click->${this.controllerName}#cycleIndicatorFilter"
            class="min-w-[5.5rem] px-2 py-2 text-xs text-gray-300 bg-[#2a2a3e] border border-[#3a3a4e] rounded hover:bg-[#3a3a4e] whitespace-nowrap text-center"
            title="Filter: ${filterLabel}"
          >${filterLabel}</button>
        </div>
      </div>
      ${paramInputs}
      ${sourceHTML}
    `
  }

  _chartTypeOpts(pairs, selected) {
    return pairs.map(([val, label]) =>
      `<option value="${val}"${val === selected ? " selected" : ""}>${label}</option>`
    ).join("")
  }

  _colorSchemeDropdown(selected) {
    const selectedScheme = OVERLAY_COLORS[selected] || OVERLAY_COLORS[0]

    const items = OVERLAY_COLORS.map((scheme, idx) => {
      const active = idx === selected
      return `
        <button
          type="button"
          data-color-scheme="${idx}"
          data-action="click->${this.controllerName}#switchColorScheme"
          class="w-full flex items-center justify-between px-2 py-2 rounded text-sm cursor-pointer
                 ${active ? "bg-blue-600/20 text-white" : "text-gray-300 hover:bg-[#2a2a3e]"}"
        >
          <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border border-black/20" style="background:${scheme.up}"></span>
            <span class="text-xs uppercase tracking-wide">Up</span>
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border border-black/20" style="background:${scheme.down}"></span>
            <span class="text-xs uppercase tracking-wide">Down</span>
          </span>
        </button>
      `
    }).join("")

    return `
      <details class="relative">
        <summary class="list-none flex items-center justify-between gap-2 px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded cursor-pointer select-none">
          <span class="inline-flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-sm border border-black/20" style="background:${selectedScheme.up}"></span>
              <span class="text-xs uppercase tracking-wide text-gray-300">Up</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-sm border border-black/20" style="background:${selectedScheme.down}"></span>
              <span class="text-xs uppercase tracking-wide text-gray-300">Down</span>
            </span>
          </span>
          <span class="text-xs text-gray-400">▼</span>
        </summary>
        <div class="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-[#1a1a2e] border border-[#3a3a4e] rounded p-1">
          ${items}
        </div>
      </details>
    `
  }

  _comboHTML(field, list, current, width) {
    const values = current && !list.includes(current) ? [current, ...list] : list
    const opts = values.map(v => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`).join("")
    const inList = !current || list.includes(current)
    const isTimeframe = field === "timeframe"
    const selectTitle = isTimeframe
      ? "Choose timeframe from list"
      : "Choose symbol from list"
    const inputTitle = isTimeframe
      ? "Enter timeframe manually, for example: 1m, 5m, 1h, 1D"
      : "Enter symbol manually, for example: BTCUSD"
    const inputPlaceholder = isTimeframe ? "1m, 5m, 1h..." : "BTCUSD"
    const toggleTitle = isTimeframe
      ? (inList ? "Current mode: list selection" : "Current mode: manual input")
      : (inList ? "Current mode: list selection" : "Current mode: manual input")
    const toggleLabel = inList ? "List" : "Manual"
    return `
      <span data-combo class="flex items-center gap-1">
        <select
          data-field="${field}"
          data-action="change->${this.controllerName}#applySettings"
          title="${selectTitle}"
          class="${inList ? "" : "hidden "}${width} px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >${opts}</select>
        <input
          data-field="${field}"
          data-action="keydown->${this.controllerName}#applySettingsOnEnter"
          value="${current}"
          title="${inputTitle}"
          placeholder="${inputPlaceholder}"
          class="${inList ? "hidden " : ""}${width} px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >
        <button
          data-action="click->${this.controllerName}#toggleCustomInput"
          class="min-w-[72px] px-3 py-2 text-sm font-medium text-blue-200 bg-[#23233d] border border-[#4a4a66] hover:bg-[#2f2f4d] hover:text-white rounded cursor-pointer shrink-0"
          title="${toggleTitle}"
        >${toggleLabel}</button>
      </span>`
  }

  _escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;")
  }
}
