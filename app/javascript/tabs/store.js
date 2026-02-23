const STORAGE_KEY = "chart-tabs"
const DEFAULT_TABS = [{
  id: "tab-1",
  name: null,
  panels: [{
    id: "p-1",
    timeframe: "1m",
    overlays: [{ id: "o-1", symbol: "BTCUSD", mode: "price", chartType: "Candlestick" }],
  }],
}]

export default class TabStore {
  constructor() {
    this.tabs = this._load()
    this._nextTabId = Math.max(...this.tabs.map(t => parseInt(t.id.split("-")[1]))) + 1
    this._nextPanelId = this._calcNextId("p")
    this._nextOverlayId = this._calcNextId("o")
    this.activeTabId = this.tabs[0].id
    this.selectedPanelId = this.tabs[0].panels[0].id
    this.selectedOverlayId = this.tabs[0].panels[0].overlays[0]?.id || null
  }

  // --- Tabs ---

  addTab() {
    const overlayId = `o-${this._nextOverlayId++}`
    const panelId = `p-${this._nextPanelId++}`
    const tab = {
      id: `tab-${this._nextTabId++}`,
      name: "New",
      panels: [{
        id: panelId,
        timeframe: "1m",
        overlays: [{ id: overlayId, symbol: null, mode: "price", chartType: "Candlestick" }],
      }],
    }
    this.tabs.push(tab)
    this.activeTabId = tab.id
    this.selectedPanelId = panelId
    this.selectedOverlayId = overlayId
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
      this.selectedOverlayId = newTab.panels[0].overlays[0]?.id || null
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
      this.selectedOverlayId = tab.panels[0].overlays[0]?.id || null
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
    const firstOverlay = first?.overlays[0]
    return firstOverlay?.symbol ? `${firstOverlay.symbol} ${first.timeframe}` : "New"
  }

  get activeTab() {
    return this.tabs.find(t => t.id === this.activeTabId)
  }

  // --- Panels ---

  addPanel(tabId) {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return null
    const overlayId = `o-${this._nextOverlayId++}`
    const panel = {
      id: `p-${this._nextPanelId++}`,
      timeframe: "1m",
      overlays: [{ id: overlayId, symbol: null, mode: "price", chartType: "Candlestick" }],
    }
    tab.panels.push(panel)
    this.selectedPanelId = panel.id
    this.selectedOverlayId = overlayId
    this._save()
    return panel
  }

  removePanel(panelId) {
    for (const tab of this.tabs) {
      const idx = tab.panels.findIndex(p => p.id === panelId)
      if (idx === -1) continue
      tab.panels.splice(idx, 1)
      if (tab.panels.length === 0) {
        const overlayId = `o-${this._nextOverlayId++}`
        const fresh = {
          id: `p-${this._nextPanelId++}`,
          timeframe: "1m",
          overlays: [{ id: overlayId, symbol: null, mode: "price", chartType: "Candlestick" }],
        }
        tab.panels.push(fresh)
        this.selectedPanelId = fresh.id
        this.selectedOverlayId = overlayId
      } else if (this.selectedPanelId === panelId) {
        const newPanel = tab.panels[Math.min(idx, tab.panels.length - 1)]
        this.selectedPanelId = newPanel.id
        this.selectedOverlayId = newPanel.overlays[0]?.id || null
      }
      this._save()
      return true
    }
    return false
  }

  selectPanel(panelId) {
    if (panelId === this.selectedPanelId) return false
    this.selectedPanelId = panelId
    const panel = this.selectedPanel
    if (panel && !panel.overlays.find(o => o.id === this.selectedOverlayId)) {
      this.selectedOverlayId = panel.overlays[0]?.id || null
    }
    return true
  }

  updatePanelTimeframe(panelId, timeframe) {
    const panel = this._findPanel(panelId)
    if (!panel || panel.timeframe === timeframe) return false
    panel.timeframe = timeframe
    this._save()
    return true
  }

  get selectedPanel() {
    return this._findPanel(this.selectedPanelId)
  }

  // --- Overlays ---

  addOverlay(panelId) {
    const panel = this._findPanel(panelId)
    if (!panel) return null
    const overlay = { id: `o-${this._nextOverlayId++}`, symbol: null, mode: "price", chartType: "Candlestick" }
    panel.overlays.push(overlay)
    this.selectedOverlayId = overlay.id
    this._save()
    return overlay
  }

  removeOverlay(panelId, overlayId) {
    const panel = this._findPanel(panelId)
    if (!panel) return false
    const idx = panel.overlays.findIndex(o => o.id === overlayId)
    if (idx === -1) return false
    panel.overlays.splice(idx, 1)
    if (panel.overlays.length === 0) {
      const fresh = { id: `o-${this._nextOverlayId++}`, symbol: null, mode: "price", chartType: "Candlestick" }
      panel.overlays.push(fresh)
      this.selectedOverlayId = fresh.id
    } else if (this.selectedOverlayId === overlayId) {
      this.selectedOverlayId = panel.overlays[Math.min(idx, panel.overlays.length - 1)].id
    }
    this._save()
    return true
  }

  selectOverlay(overlayId) {
    if (overlayId === this.selectedOverlayId) return false
    this.selectedOverlayId = overlayId
    return true
  }

  updateOverlaySymbol(overlayId, symbol) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay || overlay.symbol === symbol) return false
    overlay.symbol = symbol
    this._save()
    return true
  }

  setOverlayMode(overlayId, mode) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay || overlay.mode === mode) return false
    overlay.mode = mode
    this._save()
    return true
  }

  setOverlayChartType(overlayId, chartType) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay || overlay.chartType === chartType) return false
    overlay.chartType = chartType
    this._save()
    return true
  }

  get selectedOverlay() {
    return this._findOverlay(this.selectedOverlayId)
  }

  _findOverlay(overlayId) {
    for (const tab of this.tabs) {
      for (const panel of tab.panels) {
        const overlay = panel.overlays.find(o => o.id === overlayId)
        if (overlay) return overlay
      }
    }
    return null
  }

  _findPanel(panelId) {
    for (const tab of this.tabs) {
      const panel = tab.panels.find(p => p.id === panelId)
      if (panel) return panel
    }
    return null
  }

  // --- Persistence ---

  _calcNextId(prefix) {
    let max = 0
    for (const tab of this.tabs) {
      for (const p of tab.panels) {
        if (prefix === "p") {
          const n = parseInt(p.id.split("-")[1])
          if (n > max) max = n
        }
        if (prefix === "o" && p.overlays) {
          for (const o of p.overlays) {
            const n = parseInt(o.id.split("-")[1])
            if (n > max) max = n
          }
        }
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
    // Very old format: { id, symbol, timeframe, mode, name } (no panels)
    if (!t.panels) {
      return {
        id: t.id,
        name: t.name ?? null,
        panels: [{
          id: `p-${t.id.split("-")[1]}`,
          timeframe: t.timeframe || "1m",
          overlays: [{
            id: `o-${t.id.split("-")[1]}`,
            symbol: t.symbol ?? null,
            mode: t.mode || "price",
            chartType: "Candlestick",
          }],
        }],
      }
    }

    // Migrate panels
    return {
      ...t,
      name: t.name ?? null,
      panels: t.panels.map(p => this._migratePanel(p)),
    }
  }

  _migratePanel(p) {
    // Already has overlays — just ensure defaults
    if (p.overlays) {
      return {
        ...p,
        timeframe: p.timeframe || "1m",
        overlays: p.overlays.map(o => ({
          ...o,
          mode: o.mode || "price",
          chartType: o.chartType || "Candlestick",
        })),
      }
    }

    // Old panel format: { id, symbol, timeframe, mode } — convert to overlay model
    return {
      id: p.id,
      timeframe: p.timeframe || "1m",
      overlays: [{
        id: `o-${p.id.split("-")[1]}`,
        symbol: p.symbol ?? null,
        mode: p.mode || "price",
        chartType: "Candlestick",
      }],
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs))
  }
}
