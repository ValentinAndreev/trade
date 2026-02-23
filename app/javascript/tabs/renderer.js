export default class TabRenderer {
  constructor(tabBarEl, panelsEl, sidebarEl, { controllerName }) {
    this.tabBarEl = tabBarEl
    this.panelsEl = panelsEl
    this.sidebarEl = sidebarEl
    this.controllerName = controllerName
  }

  render(tabs, activeTabId, selectedPanelId, symbols, timeframes, labelFn) {
    this._renderTabBar(tabs, activeTabId, labelFn)
    this._renderPanels(tabs, activeTabId, selectedPanelId)
    this._renderSidebar(selectedPanelId, tabs, symbols, timeframes)
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
          class="flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer whitespace-nowrap
                 ${active
                   ? "text-white border-b-2 border-blue-400"
                   : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"}"
        >
          <span
            data-tab-label
            data-action="dblclick->${this.controllerName}#startRename"
            title="Double-click to rename"
          >${label}</span>
          ${tabs.length > 1 ? `
            <span
              data-action="click->${this.controllerName}#removeTab"
              class="ml-1 text-gray-500 hover:text-red-400 text-xs leading-none"
            >&times;</span>
          ` : ""}
        </button>
      `
    }).join("")

    const addBtn = `
      <button
        data-action="click->${this.controllerName}#addTab"
        class="px-2 py-1.5 text-gray-500 hover:text-white text-lg leading-none cursor-pointer"
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

    // Update or create panels (in-place replacement to avoid reflow on siblings)
    panels.forEach(panel => {
      const el = existing.get(panel.id)
      if (el) {
        const chartEl = el.querySelector("[data-controller='chart']")
        const hasChart = !!chartEl
        const needsChart = !!panel.symbol
        const settingsChanged = hasChart && needsChart && (
          chartEl.dataset.chartSymbolValue !== panel.symbol ||
          chartEl.dataset.chartTimeframeValue !== panel.timeframe
        )

        if (settingsChanged || hasChart !== needsChart) {
          // Replace in-place: insert new before old, then remove old
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

    // Sync dividers between panels (only rebuild if structure changed)
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

  _panelHTML(panel, selectedPanelId) {
    const selected = panel.id === selectedPanelId
    const borderClass = selected ? "border-blue-500/50" : "border-[#2a2a3e]"

    const closeBtn = `
      <div class="absolute top-1 right-1 z-10">
        <button
          data-close-panel="${panel.id}"
          data-action="click->${this.controllerName}#removePanel"
          class="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 bg-[#1a1a2e]/80 hover:bg-[#2a2a3e] rounded text-xs cursor-pointer"
          title="Remove panel"
        >&times;</button>
      </div>
    `

    if (!panel.symbol) {
      return `
        <div data-panel-id="${panel.id}"
             data-action="click->${this.controllerName}#selectPanel"
             class="relative flex-1 min-h-0 border ${borderClass} flex items-center justify-center cursor-pointer">
          ${closeBtn}
          <span class="text-gray-500 text-sm">Select a symbol</span>
        </div>
      `
    }

    const url = `/api/candles?symbol=${encodeURIComponent(panel.symbol)}&timeframe=${encodeURIComponent(panel.timeframe)}&limit=1500`
    return `
      <div data-panel-id="${panel.id}"
           data-action="click->${this.controllerName}#selectPanel"
           class="relative flex-1 min-h-0 border ${borderClass} cursor-pointer">
        ${closeBtn}
        <div
          data-controller="chart"
          data-chart-symbol-value="${panel.symbol}"
          data-chart-timeframe-value="${panel.timeframe}"
          data-chart-url-value="${url}"
          class="h-full w-full"
        ></div>
      </div>
    `
  }

  // --- Sidebar ---

  _renderSidebar(selectedPanelId, tabs, symbols, timeframes) {
    let panel = null
    for (const tab of tabs) {
      panel = tab.panels.find(p => p.id === selectedPanelId)
      if (panel) break
    }

    if (!panel) {
      this.sidebarEl.innerHTML = ""
      return
    }

    const currentSymbol = panel.symbol || ""
    const currentTimeframe = panel.timeframe || "1m"
    const mode = panel.mode || "price"

    const priceActive = mode === "price"
    const activeBtnClass = "text-white bg-blue-600"
    const inactiveBtnClass = "text-gray-400 bg-[#2a2a3e] hover:bg-[#3a3a4e]"

    const chartTypeOptions = priceActive
      ? `<option value="Candlestick">Candles</option>
         <option value="Bar">Bars</option>
         <option value="Line">Line</option>
         <option value="Area">Area</option>
         <option value="Baseline">Baseline</option>`
      : `<option value="Histogram">Bars</option>
         <option value="Line">Line</option>
         <option value="Area">Area</option>`

    this.sidebarEl.innerHTML = `
      <div class="flex flex-col gap-3 text-sm">
        <div class="text-xs text-gray-500 uppercase tracking-wide">Panel Settings</div>

        <label class="flex flex-col gap-1 text-xs text-gray-400">
          Symbol
          ${this._comboHTML("symbol", symbols, currentSymbol, "w-full")}
        </label>

        <label class="flex flex-col gap-1 text-xs text-gray-400">
          Timeframe
          ${this._comboHTML("timeframe", timeframes, currentTimeframe, "w-full")}
        </label>

        <button
          data-action="click->${this.controllerName}#applySettings"
          class="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded cursor-pointer"
        >Apply</button>

        ${panel.symbol ? `
          <hr class="border-[#3a3a4e]">

          <div class="flex gap-1">
            <button
              data-action="click->${this.controllerName}#setMode"
              data-mode="price"
              class="flex-1 px-2 py-1.5 text-xs rounded cursor-pointer ${priceActive ? activeBtnClass : inactiveBtnClass}"
            >Price</button>
            <button
              data-action="click->${this.controllerName}#setMode"
              data-mode="volume"
              class="flex-1 px-2 py-1.5 text-xs rounded cursor-pointer ${priceActive ? inactiveBtnClass : activeBtnClass}"
            >Volume</button>
          </div>

          <label class="flex flex-col gap-1 text-xs text-gray-400">
            Chart type
            <select
              data-field="chartType"
              data-action="change->${this.controllerName}#switchChartType"
              class="px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
            >${chartTypeOptions}</select>
          </label>
        ` : ""}

        <hr class="border-[#3a3a4e]">

        <button
          data-action="click->${this.controllerName}#addPanel"
          class="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-[#2a2a3e] hover:bg-[#3a3a4e] border border-[#3a3a4e] rounded cursor-pointer"
        >+ Add new panel</button>
      </div>
    `
  }

  // --- Combo (select + custom input) ---

  _comboHTML(field, list, current, width) {
    const values = current && !list.includes(current) ? [current, ...list] : list
    const opts = values.map(v => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`).join("")
    const inList = !current || list.includes(current)
    return `
      <span data-combo class="flex items-center gap-0.5">
        <select
          data-field="${field}"
          data-action="change->${this.controllerName}#applySettings"
          class="${inList ? "" : "hidden "}${width} px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >${opts}</select>
        <input
          data-field="${field}"
          value="${current}"
          class="${inList ? "hidden " : ""}${width} px-2 py-1.5 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >
        <button
          data-action="click->${this.controllerName}#toggleCustomInput"
          class="px-1 py-1 text-xs text-gray-500 hover:text-white cursor-pointer shrink-0"
          title="Toggle custom input"
        >&#9998;</button>
      </span>`
  }
}
