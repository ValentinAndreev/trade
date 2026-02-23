const STORAGE_KEY = "chart-tabs"
const DEFAULT_TABS = [{
  id: "tab-1",
  name: null,
  panels: [{ id: "p-1", symbol: "BTCUSD", timeframe: "1m", mode: "price" }],
}]

export default class TabStore {
  constructor() {
    this.tabs = this._load()
    this._nextTabId = Math.max(...this.tabs.map(t => parseInt(t.id.split("-")[1]))) + 1
    this._nextPanelId = this._calcNextPanelId()
    this.activeTabId = this.tabs[0].id
    this.selectedPanelId = this.tabs[0].panels[0].id
  }

  // --- Tabs ---

  addTab() {
    const panelId = `p-${this._nextPanelId++}`
    const tab = {
      id: `tab-${this._nextTabId++}`,
      name: "New",
      panels: [{ id: panelId, symbol: null, timeframe: "1m", mode: "price" }],
    }
    this.tabs.push(tab)
    this.activeTabId = tab.id
    this.selectedPanelId = panelId
    this._save()
    return tab
  }

  removeTab(tabId) {
    if (this.tabs.length === 1) return false
    const idx = this.tabs.findIndex(t => t.id === tabId)
    this.tabs.splice(idx, 1)

    if (this.activeTabId === tabId) {
      const newTab = this.tabs[Math.min(idx, this.tabs.length - 1)]
      this.activeTabId = newTab.id
      this.selectedPanelId = newTab.panels[0].id
    }
    this._save()
    return true
  }

  activateTab(tabId) {
    if (tabId === this.activeTabId) return false
    this.activeTabId = tabId
    const tab = this.activeTab
    if (tab && !tab.panels.find(p => p.id === this.selectedPanelId)) {
      this.selectedPanelId = tab.panels[0].id
    }
    return true
  }

  renameTab(tabId, name) {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return false
    tab.name = name || null
    this._save()
    return true
  }

  tabLabel(tab) {
    if (tab.name) return tab.name
    const first = tab.panels[0]
    return first?.symbol ? `${first.symbol} ${first.timeframe}` : "New"
  }

  get activeTab() {
    return this.tabs.find(t => t.id === this.activeTabId)
  }

  // --- Panels ---

  addPanel(tabId) {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return null
    const panel = { id: `p-${this._nextPanelId++}`, symbol: null, timeframe: "1m", mode: "price" }
    tab.panels.push(panel)
    this.selectedPanelId = panel.id
    this._save()
    return panel
  }

  removePanel(panelId) {
    for (const tab of this.tabs) {
      const idx = tab.panels.findIndex(p => p.id === panelId)
      if (idx === -1) continue
      tab.panels.splice(idx, 1)
      if (tab.panels.length === 0) {
        const fresh = { id: `p-${this._nextPanelId++}`, symbol: null, timeframe: "1m", mode: "price" }
        tab.panels.push(fresh)
        this.selectedPanelId = fresh.id
      } else if (this.selectedPanelId === panelId) {
        this.selectedPanelId = tab.panels[Math.min(idx, tab.panels.length - 1)].id
      }
      this._save()
      return true
    }
    return false
  }

  selectPanel(panelId) {
    if (panelId === this.selectedPanelId) return false
    this.selectedPanelId = panelId
    return true
  }

  updatePanelSettings(panelId, symbol, timeframe) {
    const panel = this._findPanel(panelId)
    if (!panel) return false
    if (symbol === panel.symbol && timeframe === panel.timeframe) return false
    panel.symbol = symbol
    panel.timeframe = timeframe
    this._save()
    return true
  }

  setPanelMode(panelId, mode) {
    const panel = this._findPanel(panelId)
    if (!panel || panel.mode === mode) return false
    panel.mode = mode
    this._save()
    return true
  }

  get selectedPanel() {
    return this._findPanel(this.selectedPanelId)
  }

  _findPanel(panelId) {
    for (const tab of this.tabs) {
      const panel = tab.panels.find(p => p.id === panelId)
      if (panel) return panel
    }
    return null
  }

  // --- Persistence ---

  _calcNextPanelId() {
    let max = 0
    for (const tab of this.tabs) {
      for (const p of tab.panels) {
        const n = parseInt(p.id.split("-")[1])
        if (n > max) max = n
      }
    }
    return max + 1
  }

  _load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const tabs = JSON.parse(stored)
        if (Array.isArray(tabs) && tabs.length > 0) {
          return tabs.map(t => this._migrateTab(t))
        }
      }
    } catch { /* ignore */ }
    return structuredClone(DEFAULT_TABS)
  }

  _migrateTab(t) {
    // Old format: { id, symbol, timeframe, mode, name }
    if (!t.panels) {
      return {
        id: t.id,
        name: t.name ?? null,
        panels: [{
          id: `p-${t.id.split("-")[1]}`,
          symbol: t.symbol ?? null,
          timeframe: t.timeframe || "1m",
          mode: t.mode || "price",
        }],
      }
    }
    // New format
    return {
      ...t,
      name: t.name ?? null,
      panels: t.panels.map(p => ({
        ...p,
        symbol: p.symbol ?? null,
        mode: p.mode || "price",
      })),
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs))
  }
}
