import { Controller } from "@hotwired/stimulus"

const STORAGE_KEY = "chart-tabs"
const DEFAULT_TABS = [{ id: "tab-1", symbol: "BTCUSD", timeframe: "1m" }]

export default class extends Controller {
  static targets = ["tabBar", "panels"]

  async connect() {
    this.nextId = 1
    this.symbols = []
    this.timeframes = []
    this.tabs = this.loadTabs()
    this.nextId = Math.max(...this.tabs.map(t => parseInt(t.id.split("-")[1]))) + 1
    this.activeTabId = this.tabs[0].id

    await this.fetchConfig()
    this.render()
  }

  async fetchConfig() {
    try {
      const resp = await fetch("/api/configs")
      const data = await resp.json()
      this.symbols = data.symbols || []
      this.timeframes = data.timeframes || []
    } catch {
      this.symbols = []
      this.timeframes = []
    }
  }

  addTab() {
    const symbol = this.symbols[0] || "BTCUSD"
    const timeframe = this.timeframes[0] || "1m"
    const tab = { id: `tab-${this.nextId++}`, symbol, timeframe }
    this.tabs.push(tab)
    this.activeTabId = tab.id
    this.render()
    this.saveTabs()
  }

  removeTab(e) {
    e.stopPropagation()
    if (this.tabs.length === 1) return

    const tabId = e.currentTarget.closest("[data-tab-id]").dataset.tabId
    const idx = this.tabs.findIndex(t => t.id === tabId)
    this.tabs.splice(idx, 1)

    if (this.activeTabId === tabId) {
      this.activeTabId = this.tabs[Math.min(idx, this.tabs.length - 1)].id
    }

    this.render()
    this.saveTabs()
  }

  switchTab(e) {
    const tabId = e.currentTarget.dataset.tabId
    if (tabId === this.activeTabId) return

    this.activeTabId = tabId
    this.render()
  }

  applySettings(e) {
    const panel = e.currentTarget.closest("[data-panel-id]")
    const tabId = panel.dataset.panelId
    const tab = this.tabs.find(t => t.id === tabId)
    const symbolEl = panel.querySelector("[data-field='symbol']:not(.hidden)")
    const timeframeEl = panel.querySelector("[data-field='timeframe']:not(.hidden)")
    const newSymbol = symbolEl.value.trim().toUpperCase()
    const newTimeframe = timeframeEl.value.trim().toLowerCase()

    if (!newSymbol || !newTimeframe) return
    if (newSymbol === tab.symbol && newTimeframe === tab.timeframe) return

    tab.symbol = newSymbol
    tab.timeframe = newTimeframe
    this.render()
    this.saveTabs()
  }

  toggleVolume(e) {
    const panel = e.currentTarget.closest("[data-panel-id]")
    const chartEl = panel.querySelector("[data-controller='chart']")
    if (!chartEl) return

    const chartCtrl = this.application.getControllerForElementAndIdentifier(chartEl, "chart")
    if (!chartCtrl) return

    chartCtrl.toggleVolume()
    const btn = e.currentTarget
    btn.classList.toggle("text-gray-300", chartCtrl.volumeVisible)
    btn.classList.toggle("text-gray-500", !chartCtrl.volumeVisible)
  }

  toggleCustomInput(e) {
    const wrapper = e.currentTarget.closest("[data-combo]")
    const select = wrapper.querySelector("select")
    const input = wrapper.querySelector("input")

    if (select.classList.contains("hidden")) {
      select.classList.remove("hidden")
      input.classList.add("hidden")
      select.value = input.value || select.options[0]?.value
    } else {
      select.classList.add("hidden")
      input.classList.remove("hidden")
      input.value = select.value
      input.focus()
    }
  }

  // --- Rendering ---

  render() {
    this.renderTabBar()
    this.renderPanels()
  }

  renderTabBar() {
    const buttons = this.tabs.map(tab => {
      const active = tab.id === this.activeTabId
      return `
        <button
          data-tab-id="${tab.id}"
          data-action="click->tabs#switchTab"
          class="flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer whitespace-nowrap
                 ${active
                   ? "text-white border-b-2 border-blue-400"
                   : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"}"
        >
          <span>${tab.symbol} ${tab.timeframe}</span>
          ${this.tabs.length > 1 ? `
            <span
              data-action="click->tabs#removeTab"
              class="ml-1 text-gray-500 hover:text-red-400 text-xs leading-none"
            >&times;</span>
          ` : ""}
        </button>
      `
    }).join("")

    const addBtn = `
      <button
        data-action="click->tabs#addTab"
        class="px-2 py-1.5 text-gray-500 hover:text-white text-lg leading-none cursor-pointer"
      >+</button>
    `

    this.tabBarTarget.innerHTML = buttons + addBtn
  }

  renderPanels() {
    const existing = new Set()
    // Update visibility of existing panels, track which exist
    this.panelsTarget.querySelectorAll("[data-panel-id]").forEach(panel => {
      const panelId = panel.dataset.panelId
      existing.add(panelId)
      const tab = this.tabs.find(t => t.id === panelId)
      if (!tab) {
        panel.remove()
        return
      }
      panel.classList.toggle("hidden", panelId !== this.activeTabId)
    })

    // Create missing panels
    this.tabs.forEach(tab => {
      if (existing.has(tab.id)) {
        // Check if symbol/timeframe changed — if so, rebuild chart
        const panel = this.panelsTarget.querySelector(`[data-panel-id="${tab.id}"]`)
        const chartEl = panel.querySelector("[data-controller='chart']")
        if (chartEl && (chartEl.dataset.chartSymbolValue !== tab.symbol || chartEl.dataset.chartTimeframeValue !== tab.timeframe)) {
          panel.remove()
          existing.delete(tab.id)
        } else {
          return
        }
      }

      const html = this.panelHTML(tab)
      this.panelsTarget.insertAdjacentHTML("beforeend", html)
    })
  }

  buildOptions(list, current) {
    const values = list.includes(current) ? list : [current, ...list]
    return values.map(v => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`).join("")
  }

  comboHTML(field, list, current, width) {
    const opts = this.buildOptions(list, current)
    const inList = list.includes(current)
    return `
      <span data-combo class="flex items-center gap-0.5">
        <select
          data-field="${field}"
          data-action="change->tabs#applySettings"
          class="${inList ? "" : "hidden "}${width} px-2 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >${opts}</select>
        <input
          data-field="${field}"
          value="${current}"
          class="${inList ? "hidden " : ""}${width} px-2 py-1 text-sm text-white bg-[#2a2a3e] border border-[#3a3a4e] rounded focus:outline-none focus:border-blue-400"
        >
        <button
          data-action="click->tabs#toggleCustomInput"
          class="px-1 py-1 text-xs text-gray-500 hover:text-white cursor-pointer"
          title="Toggle custom input"
        >&#9998;</button>
      </span>`
  }

  panelHTML(tab) {
    const url = `/api/candles?symbol=${encodeURIComponent(tab.symbol)}&timeframe=${encodeURIComponent(tab.timeframe)}&limit=1500`
    const hidden = tab.id !== this.activeTabId ? "hidden" : ""

    return `
      <div data-panel-id="${tab.id}" class="flex flex-col h-full ${hidden}">
        <div class="flex items-center gap-3 px-3 py-2 bg-[#1a1a2e] border-b border-[#2a2a3e]">
          <label class="flex items-center gap-1 text-xs text-gray-400">
            Symbol ${this.comboHTML("symbol", this.symbols, tab.symbol, "w-28")}
          </label>
          <label class="flex items-center gap-1 text-xs text-gray-400">
            Timeframe ${this.comboHTML("timeframe", this.timeframes, tab.timeframe, "w-20")}
          </label>
          <button
            data-action="click->tabs#applySettings"
            class="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded cursor-pointer"
          >Apply</button>
          <button
            data-action="click->tabs#toggleVolume"
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

  // --- Persistence ---

  loadTabs() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const tabs = JSON.parse(stored)
        if (Array.isArray(tabs) && tabs.length > 0) return tabs
      }
    } catch { /* ignore */ }
    return structuredClone(DEFAULT_TABS)
  }

  saveTabs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs))
  }
}
