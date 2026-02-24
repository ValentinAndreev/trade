import { OVERLAY_COLORS } from "../chart/theme"
import { INDICATOR_META } from "../chart/indicators"

export default class TabRenderer {
  constructor(tabBarEl, panelsEl, sidebarEl, { controllerName }) {
    this.tabBarEl = tabBarEl
    this.panelsEl = panelsEl
    this.sidebarEl = sidebarEl
    this.controllerName = controllerName
  }

  render(tabs, activeTabId, selectedPanelId, selectedOverlayId, symbols, timeframes, labelFn, indicators) {
    this.indicators = indicators || []
    this._renderTabBar(tabs, activeTabId, labelFn)
    this._renderPanels(tabs, activeTabId, selectedPanelId)
    this._renderSidebar(selectedPanelId, selectedOverlayId, tabs, symbols, timeframes)
  }

  // --- Tab Bar ---

  _renderTabBar(tabs, activeTabId, labelFn) {
    const buttons = tabs.map(tab => {
      const active = tab.id === activeTabId
      const label = labelFn ? labelFn(tab) : "New"
      return `
        <button
          data-tab-id="${tab.id}"
          data-action="click->${this.controllerName}#switchTab"
          class="flex items-center gap-2 px-4 py-2 text-base font-medium cursor-pointer whitespace-nowrap
                 ${active
                   ? "text-white border-b-2 border-blue-400"
                   : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"}"
        >
          <span
            data-tab-label
            data-action="dblclick->${this.controllerName}#startRename"
            title="Double-click to rename tab"
          >${label}</span>
          ${tabs.length > 1 ? `
            <span
              data-action="click->${this.controllerName}#removeTab"
              title="Remove tab"
              class="ml-1 inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none"
            >&times;</span>
          ` : ""}
        </button>
      `
    }).join("")

    const addBtn = `
      <button
        data-action="click->${this.controllerName}#addTab"
        class="px-3 py-2 text-gray-400 hover:text-white text-2xl leading-none cursor-pointer"
        title="Add new tab"
      >+</button>
    `

    this.tabBarEl.innerHTML = buttons + addBtn
  }

  // --- Panels ---

  _renderPanels(tabs, activeTabId, selectedPanelId) {
    // Remove tab wrappers for deleted tabs
    this.panelsEl.querySelectorAll("[data-tab-wrapper]").forEach(wrapper => {
      const tabId = wrapper.dataset.tabWrapper
      if (!tabs.find(t => t.id === tabId)) wrapper.remove()
    })

    tabs.forEach(tab => {
      const isActive = tab.id === activeTabId
      let wrapper = this.panelsEl.querySelector(`[data-tab-wrapper="${tab.id}"]`)

      if (!wrapper) {
        wrapper = document.createElement("div")
        wrapper.dataset.tabWrapper = tab.id
        wrapper.className = "flex flex-col h-full"
        this.panelsEl.appendChild(wrapper)
      }

      wrapper.classList.toggle("hidden", !isActive)
      if (!isActive) return

      this._syncPanels(wrapper, tab.panels, selectedPanelId)
    })
  }

  _syncPanels(wrapper, panels, selectedPanelId) {
    const existing = new Map()
    wrapper.querySelectorAll(":scope > [data-panel-id]").forEach(el => {
      existing.set(el.dataset.panelId, el)
    })

    // Save flex values before any DOM changes
    const savedFlex = new Map()
    for (const [id, el] of existing) {
      if (el.style.flex) savedFlex.set(id, el.style.flex)
    }

    // Remove panels that no longer exist
    for (const [id, el] of existing) {
      if (!panels.find(p => p.id === id)) {
        el.remove()
        existing.delete(id)
        savedFlex.delete(id)
      }
    }

    // Update or create panels
    panels.forEach(panel => {
      const el = existing.get(panel.id)
      const overlaysJson = this._overlaysJson(panel)
      const hasSymbols = panel.overlays.some(o => o.symbol)

      if (el) {
        const chartEl = el.querySelector("[data-controller='chart']")
        const hasChart = !!chartEl
        const needsChart = hasSymbols

        const settingsChanged = hasChart && needsChart && (
          chartEl.dataset.chartTimeframeValue !== panel.timeframe ||
          chartEl.dataset.chartOverlaysValue !== overlaysJson
        )

        if (settingsChanged || hasChart !== needsChart) {
          const placeholder = document.createElement("template")
          placeholder.innerHTML = this._panelHTML(panel, selectedPanelId)
          const newEl = placeholder.content.firstElementChild
          if (savedFlex.has(panel.id)) newEl.style.flex = savedFlex.get(panel.id)
          el.replaceWith(newEl)
          existing.delete(panel.id)
        } else {
          this._updatePanelBorder(el, panel.id === selectedPanelId)
        }
        return
      }

      // Truly new panel — append at end
      wrapper.insertAdjacentHTML("beforeend", this._panelHTML(panel, selectedPanelId))
    })

    // Sync dividers between panels
    const panelEls = [...wrapper.querySelectorAll(":scope > [data-panel-id]")]
    const expectedPairs = []
    for (let i = 0; i < panelEls.length - 1; i++) {
      expectedPairs.push({ above: panelEls[i].dataset.panelId, below: panelEls[i + 1].dataset.panelId })
    }

    const existingDividers = [...wrapper.querySelectorAll(":scope > [data-divider]")]
    const needsRebuild = existingDividers.length !== expectedPairs.length ||
      existingDividers.some((d, i) => d.dataset.above !== expectedPairs[i].above || d.dataset.below !== expectedPairs[i].below)

    if (needsRebuild) {
      existingDividers.forEach(d => d.remove())
      for (let i = 0; i < panelEls.length - 1; i++) {
        const divider = document.createElement("div")
        divider.dataset.divider = ""
        divider.dataset.above = panelEls[i].dataset.panelId
        divider.dataset.below = panelEls[i + 1].dataset.panelId
        divider.className = "h-1.5 shrink-0 cursor-row-resize bg-[#2a2a3e] hover:bg-[#5a5a7e] transition-colors"
        divider.dataset.action = `mousedown->${this.controllerName}#startResize`
        panelEls[i].after(divider)
      }
    }
  }

  _updatePanelBorder(panel, selected) {
    panel.classList.toggle("border-blue-500/50", selected)
    panel.classList.toggle("border-[#2a2a3e]", !selected)
  }

  _overlaysJson(panel) {
    return JSON.stringify(panel.overlays.filter(o => o.symbol).map(o => {
      const base = { id: o.id, symbol: o.symbol, mode: o.mode, chartType: o.chartType }
      if (o.mode === "indicator") {
        base.indicatorType = o.indicatorType
        base.indicatorParams = o.indicatorParams
        base.pinnedTo = o.pinnedTo
      }
      return base
    }))
  }

  _panelLegendHTML(panel) {
    const timeframe = panel.timeframe || "1m"
    const lines = panel.overlays
      .filter(o => o.symbol)
      .map(o => {
        let modeLabel
        if (o.mode === "indicator" && o.indicatorType) {
          const sourceOverlay = o.pinnedTo ? panel.overlays.find(s => s.id === o.pinnedTo) : null
          const sourceSymbol = this._escapeHTML(sourceOverlay ? sourceOverlay.symbol : o.symbol)
          const sourceMode = sourceOverlay ? (sourceOverlay.mode === "volume" ? "Volume" : "Price") : "Price"
          const paramsStr = o.indicatorParams
            ? Object.values(o.indicatorParams).join(",")
            : ""
          modeLabel = `${(o.indicatorType || "").toUpperCase()}${paramsStr ? `(${paramsStr})` : ""}`
          return `<div class="truncate">${sourceSymbol} ${sourceMode} ${modeLabel} ${timeframe}</div>`
        }
        const symbol = this._escapeHTML(o.symbol)
        modeLabel = o.mode === "volume" ? "Volume" : "Price"
        return `<div class="truncate">${symbol} ${modeLabel} ${timeframe}</div>`
      })
      .join("")

    if (!lines) return ""

    return `
      <div class="absolute top-2 left-3 z-10 max-w-[72%] pointer-events-none flex flex-col gap-0.5 text-base font-medium text-gray-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]">
        ${lines}
      </div>
    `
  }

  _escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;")
  }

  _panelHTML(panel, selectedPanelId) {
    const selected = panel.id === selectedPanelId
    const borderClass = selected ? "border-blue-500/50" : "border-[#2a2a3e]"
    const hasSymbols = panel.overlays.some(o => o.symbol)

    const closeBtn = `
      <div class="absolute top-1 right-1 z-10">
        <button
          data-close-panel="${panel.id}"
          data-action="click->${this.controllerName}#removePanel"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-300 bg-[#1a1a2e]/85 hover:bg-[#2a2a3e] rounded text-base cursor-pointer"
          title="Remove panel"
        >&times;</button>
      </div>
    `

    if (!hasSymbols) {
      return `
        <div data-panel-id="${panel.id}"
             data-action="click->${this.controllerName}#selectPanel"
             class="relative flex-1 min-h-0 border ${borderClass} flex items-center justify-center cursor-pointer">
          ${closeBtn}
          <span class="text-gray-500 text-base">Select a symbol</span>
        </div>
      `
    }

    const overlaysJson = this._overlaysJson(panel)
    const panelLegend = this._panelLegendHTML(panel)
    return `
      <div data-panel-id="${panel.id}"
           data-action="click->${this.controllerName}#selectPanel"
           class="relative flex-1 min-h-0 border ${borderClass} cursor-pointer">
        ${closeBtn}
        <div
          data-controller="chart"
          data-chart-timeframe-value="${panel.timeframe}"
          data-chart-overlays-value='${overlaysJson.replace(/'/g, "&#39;")}'
          class="absolute inset-0"
        ></div>
        ${panelLegend}
      </div>
    `
  }

  // --- Sidebar ---

  _renderSidebar(selectedPanelId, selectedOverlayId, tabs, symbols, timeframes) {
    let panel = null
    for (const tab of tabs) {
      panel = tab.panels.find(p => p.id === selectedPanelId)
      if (panel) break
    }

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
        modeLabel = (o.indicatorType || "ind").toUpperCase()
      } else {
        label = o.symbol || "Empty"
        modeLabel = o.mode === "volume" ? "Volume" : "Price"
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
            <span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded border text-xs leading-none
                         ${isSelected ? "text-blue-200 border-blue-300/40 bg-blue-500/10" : "text-gray-400 border-gray-500/40 bg-[#2a2a3e]"}">${modeLabel}</span>
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
          <span class="text-sm text-gray-500 uppercase tracking-wide">Charts</span>
          <button
            data-action="click->${this.controllerName}#addOverlay"
            class="text-sm text-gray-400 hover:text-white cursor-pointer"
            title="Add chart"
          >+ Chart</button>
        </div>

        <div class="flex flex-col gap-0.5">${overlayList}</div>

        <hr class="border-[#3a3a4e]">

        <div class="text-sm text-gray-500 uppercase tracking-wide">Selected Chart</div>

        <label class="flex flex-col gap-1 text-sm text-gray-400">
          Symbol
          ${this._comboHTML("symbol", symbols, currentSymbol, "w-full")}
        </label>

        ${!selectedOverlay?.symbol ? `
          <button
            data-action="click->${this.controllerName}#applySettings"
            class="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
          >Apply</button>
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

        ${selectedOverlay?.symbol ? `
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
        ` : ""}
      </div>
    `
  }

  _indicatorSettingsHTML(indicatorType, indicatorParams, selectedOverlay, panel) {
    const indicators = this.indicators || []
    const meta = INDICATOR_META[indicatorType]

    // Build indicator type options — prefer server list, fallback to INDICATOR_META keys
    const indicatorKeys = indicators.length > 0
      ? indicators.map(i => i.key)
      : Object.keys(INDICATOR_META)

    const indicatorOpts = indicatorKeys.map(key => {
      const serverInfo = indicators.find(i => i.key === key)
      const label = serverInfo ? serverInfo.name : key.toUpperCase()
      return `<option value="${key}"${key === indicatorType ? " selected" : ""}>${label}</option>`
    }).join("")

    // Build param inputs from meta
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

    // Build "Source" dropdown — which overlay's data to calculate indicator from
    const pinnedTo = selectedOverlay?.pinnedTo || null
    const pinTargets = panel.overlays.filter(o => o.id !== selectedOverlay?.id && o.symbol)
    let sourceHTML = ""
    if (pinTargets.length > 0) {
      const sourceOpts = [
        `<option value=""${!pinnedTo ? " selected" : ""}>Own (${this._escapeHTML(selectedOverlay?.symbol || "—")})</option>`,
        ...pinTargets.map(o => {
          const modeLabel = o.mode === "volume" ? "Vol" : (o.mode === "indicator" ? (o.indicatorType || "").toUpperCase() : "Price")
          return `<option value="${o.id}"${o.id === pinnedTo ? " selected" : ""}>${this._escapeHTML(o.symbol)} ${modeLabel}</option>`
        }),
      ].join("")

      sourceHTML = `
        <label class="flex flex-col gap-1 text-sm text-gray-400">
          Source
          <select
            data-field="pinnedTo"
            data-action="change->${this.controllerName}#changePinnedTo"
            class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
          >${sourceOpts}</select>
        </label>
      `
    }

    return `
      <label class="flex flex-col gap-1 text-sm text-gray-400">
        Indicator
        <select
          data-field="indicatorType"
          data-action="change->${this.controllerName}#switchIndicatorType"
          class="px-2 py-2 text-base text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >${indicatorOpts}</select>
      </label>
      ${paramInputs}
      ${sourceHTML}
      <button
        data-action="click->${this.controllerName}#applyIndicator"
        class="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
      >Apply</button>
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

  // --- Combo (select + custom input) ---

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
}
