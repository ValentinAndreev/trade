export default class TabRenderer {
  constructor(tabBarEl, panelsEl, { controllerName }) {
    this.tabBarEl = tabBarEl
    this.panelsEl = panelsEl
    this.controllerName = controllerName
  }

  render(tabs, activeTabId, symbols, timeframes) {
    this._renderTabBar(tabs, activeTabId)
    this._renderPanels(tabs, activeTabId, symbols, timeframes)
  }

  _renderTabBar(tabs, activeTabId) {
    const buttons = tabs.map(tab => {
      const active = tab.id === activeTabId
      return `
        <button
          data-tab-id="${tab.id}"
          data-action="click->${this.controllerName}#switchTab"
          class="flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer whitespace-nowrap
                 ${active
                   ? "text-white border-b-2 border-blue-400"
                   : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"}"
        >
          <span>${tab.symbol} ${tab.timeframe}</span>
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

  _renderPanels(tabs, activeTabId, symbols, timeframes) {
    const existing = new Set()

    this.panelsEl.querySelectorAll("[data-panel-id]").forEach(panel => {
      const panelId = panel.dataset.panelId
      existing.add(panelId)
      const tab = tabs.find(t => t.id === panelId)
      if (!tab) {
        panel.remove()
        return
      }
      panel.classList.toggle("hidden", panelId !== activeTabId)
    })

    tabs.forEach(tab => {
      if (existing.has(tab.id)) {
        const panel = this.panelsEl.querySelector(`[data-panel-id="${tab.id}"]`)
        const chartEl = panel.querySelector("[data-controller='chart']")
        if (chartEl && (chartEl.dataset.chartSymbolValue !== tab.symbol || chartEl.dataset.chartTimeframeValue !== tab.timeframe)) {
          panel.remove()
          existing.delete(tab.id)
        } else {
          return
        }
      }

      this.panelsEl.insertAdjacentHTML("beforeend", this._panelHTML(tab, activeTabId, symbols, timeframes))
    })
  }

  _panelHTML(tab, activeTabId, symbols, timeframes) {
    const url = `/api/candles?symbol=${encodeURIComponent(tab.symbol)}&timeframe=${encodeURIComponent(tab.timeframe)}&limit=1500`
    const hidden = tab.id !== activeTabId ? "hidden" : ""

    return `
      <div data-panel-id="${tab.id}" class="flex flex-col h-full ${hidden}">
        <div class="flex items-center gap-3 px-3 py-2 bg-[#1a1a2e] border-b border-[#2a2a3e]">
          <label class="flex items-center gap-1 text-xs text-gray-400">
            Symbol ${this._comboHTML("symbol", symbols, tab.symbol, "w-28")}
          </label>
          <label class="flex items-center gap-1 text-xs text-gray-400">
            Timeframe ${this._comboHTML("timeframe", timeframes, tab.timeframe, "w-20")}
          </label>
          <button
            data-action="click->${this.controllerName}#applySettings"
            class="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded cursor-pointer"
          >Apply</button>
          <span class="border-l border-[#3a3a4e] h-4"></span>
          <label class="flex items-center gap-1 text-xs text-gray-400">
            Price
            <select
              data-field="priceType"
              data-action="change->${this.controllerName}#switchPriceType"
              class="px-1.5 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
            >
              <option value="Candlestick" selected>Candles</option>
              <option value="Bar">Bars</option>
              <option value="Line">Line</option>
              <option value="Area">Area</option>
              <option value="Baseline">Baseline</option>
            </select>
          </label>
          <label class="flex items-center gap-1 text-xs text-gray-400">
            Vol
            <select
              data-field="volumeType"
              data-action="change->${this.controllerName}#switchVolumeType"
              class="px-1.5 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
            >
              <option value="Histogram" selected>Bars</option>
              <option value="Line">Line</option>
              <option value="Area">Area</option>
            </select>
          </label>
          <button
            data-action="click->${this.controllerName}#toggleVolume"
            data-vol-btn
            class="px-3 py-1 text-xs text-gray-300 bg-[#2a2a3e] hover:bg-[#3a3a4e] border border-[#3a3a4e] rounded cursor-pointer"
          >Vol</button>
        </div>
        <div class="flex-1 min-h-0">
          <div
            data-controller="chart"
            data-chart-symbol-value="${tab.symbol}"
            data-chart-timeframe-value="${tab.timeframe}"
            data-chart-url-value="${url}"
            class="h-full w-full"
          ></div>
        </div>
      </div>
    `
  }

  _comboHTML(field, list, current, width) {
    const values = list.includes(current) ? list : [current, ...list]
    const opts = values.map(v => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`).join("")
    const inList = list.includes(current)
    return `
      <span data-combo class="flex items-center gap-0.5">
        <select
          data-field="${field}"
          data-action="change->${this.controllerName}#applySettings"
          class="${inList ? "" : "hidden "}${width} px-2 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >${opts}</select>
        <input
          data-field="${field}"
          value="${current}"
          class="${inList ? "hidden " : ""}${width} px-2 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >
        <button
          data-action="click->${this.controllerName}#toggleCustomInput"
          class="px-1 py-1 text-xs text-gray-500 hover:text-white cursor-pointer"
          title="Toggle custom input"
        >&#9998;</button>
      </span>`
  }
}
