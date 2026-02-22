const STORAGE_KEY = "chart-tabs"
const DEFAULT_TABS = [{ id: "tab-1", symbol: "BTCUSD", timeframe: "1m" }]

export default class TabStore {
  constructor() {
    this.tabs = this._load()
    this.nextId = Math.max(...this.tabs.map(t => parseInt(t.id.split("-")[1]))) + 1
    this.activeTabId = this.tabs[0].id
  }

  add(symbol, timeframe) {
    const tab = { id: `tab-${this.nextId++}`, symbol, timeframe }
    this.tabs.push(tab)
    this.activeTabId = tab.id
    this._save()
    return tab
  }

  remove(tabId) {
    if (this.tabs.length === 1) return false
    const idx = this.tabs.findIndex(t => t.id === tabId)
    this.tabs.splice(idx, 1)

    if (this.activeTabId === tabId) {
      this.activeTabId = this.tabs[Math.min(idx, this.tabs.length - 1)].id
    }
    this._save()
    return true
  }

  activate(tabId) {
    if (tabId === this.activeTabId) return false
    this.activeTabId = tabId
    return true
  }

  updateSettings(tabId, symbol, timeframe) {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return false
    if (symbol === tab.symbol && timeframe === tab.timeframe) return false

    tab.symbol = symbol
    tab.timeframe = timeframe
    this._save()
    return true
  }

  get active() {
    return this.tabs.find(t => t.id === this.activeTabId)
  }

  _load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const tabs = JSON.parse(stored)
        if (Array.isArray(tabs) && tabs.length > 0) return tabs
      }
    } catch { /* ignore */ }
    return structuredClone(DEFAULT_TABS)
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs))
  }
}
