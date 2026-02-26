import { OVERLAY_COLORS } from "../chart/theme"
import { loadTabs, saveTabs, calcNextId, loadActiveTabId, saveActiveTabId } from "./persistence"

export default class TabStore {
  constructor() {
    this.tabs = loadTabs()
    this._nextTabId = Math.max(...this.tabs.map(t => parseInt(t.id.split("-")[1]))) + 1
    this._nextPanelId = calcNextId(this.tabs, "p")
    this._nextOverlayId = calcNextId(this.tabs, "o")
    this._nextLabelId = this._calcNextLabelId()

    const savedTabId = loadActiveTabId()
    const savedTab = savedTabId && this.tabs.find(t => t.id === savedTabId)
    const activeTab = savedTab || this.tabs[0]
    this.activeTabId = activeTab.id
    this.selectedPanelId = activeTab.panels[0].id
    this.selectedOverlayId = activeTab.panels[0].overlays[0]?.id || null
  }

  // --- Tabs ---

  addTab({ symbol = null } = {}) {
    const overlayId = `o-${this._nextOverlayId++}`
    const panelId = `p-${this._nextPanelId++}`
    const tab = {
      id: `tab-${this._nextTabId++}`,
      name: symbol || this._newTabName(),
      panels: [{
        id: panelId,
        timeframe: "1m",
        overlays: [this._newOverlay(overlayId, symbol, 0)],
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
    saveActiveTabId(this.activeTabId)
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
      overlays: [this._newOverlay(overlayId, null, 0)],
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
          overlays: [this._newOverlay(overlayId, null, 0)],
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
    const colorScheme = panel.overlays.length % OVERLAY_COLORS.length
    const overlay = this._newOverlay(`o-${this._nextOverlayId++}`, null, colorScheme)
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
      const fresh = this._newOverlay(`o-${this._nextOverlayId++}`, null, 0)
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
    if (mode === "indicator") {
      if (!overlay.indicatorType) {
        overlay.indicatorType = "sma"
        overlay.indicatorParams = { period: 20 }
      }
      // Auto-pin to first overlay with symbol on same panel
      if (!overlay.pinnedTo) {
        const panel = this._findPanelForOverlay(overlayId)
        if (panel) {
          const source = panel.overlays.find(o => o.id !== overlayId && o.symbol)
          if (source) overlay.pinnedTo = source.id
        }
      }
    } else {
      overlay.pinnedTo = null
    }
    this._save()
    return true
  }

  setOverlayPinnedTo(overlayId, pinnedTo) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    overlay.pinnedTo = pinnedTo || null
    this._save()
    return true
  }

  setOverlayIndicatorType(overlayId, type) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    overlay.indicatorType = type
    this._save()
    return true
  }

  setOverlayIndicatorParams(overlayId, params) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    overlay.indicatorParams = params ? { ...params } : null
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

  setOverlayVisible(overlayId, visible) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    const normalized = visible !== false
    if (overlay.visible === normalized) return false
    overlay.visible = normalized
    this._save()
    return true
  }

  setOverlayColorScheme(overlayId, colorScheme) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    const normalized = this._normalizeColorScheme(colorScheme)
    if (overlay.colorScheme === normalized) return false
    overlay.colorScheme = normalized
    this._save()
    return true
  }

  setOverlayOpacity(overlayId, opacity) {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    const normalized = this._normalizeOpacity(opacity)
    if (overlay.opacity === normalized) return false
    overlay.opacity = normalized
    this._save()
    return true
  }

  get selectedOverlay() {
    return this._findOverlay(this.selectedOverlayId)
  }

  overlayById(overlayId) {
    return this._findOverlay(overlayId)
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

  _findPanelForOverlay(overlayId) {
    for (const tab of this.tabs) {
      for (const panel of tab.panels) {
        if (panel.overlays.some(o => o.id === overlayId)) return panel
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

  // --- Labels ---

  addLabel(panelId, label) {
    const panel = this._findPanel(panelId)
    if (!panel) return null
    if (!panel.labels) panel.labels = []
    const newLabel = { id: `lbl-${this._nextLabelId++}`, ...label }
    panel.labels.push(newLabel)
    this._save()
    return newLabel
  }

  removeLabel(panelId, labelId) {
    const panel = this._findPanel(panelId)
    if (!panel || !panel.labels) return false
    const idx = panel.labels.findIndex(l => l.id === labelId)
    if (idx === -1) return false
    panel.labels.splice(idx, 1)
    this._save()
    return true
  }

  updateLabel(panelId, labelId, updates) {
    const panel = this._findPanel(panelId)
    if (!panel || !panel.labels) return false
    const label = panel.labels.find(l => l.id === labelId)
    if (!label) return false
    Object.assign(label, updates)
    this._save()
    return true
  }

  _calcNextLabelId() {
    let max = 0
    for (const tab of this.tabs) {
      for (const panel of tab.panels) {
        if (!panel.labels) continue
        for (const label of panel.labels) {
          const num = parseInt(label.id.split("-")[1])
          if (num > max) max = num
        }
      }
    }
    return max + 1
  }

  _newOverlay(id, symbol = null, colorScheme = 0) {
    return {
      id,
      symbol,
      mode: "price",
      chartType: "Candlestick",
      visible: true,
      colorScheme: this._normalizeColorScheme(colorScheme),
      opacity: 1,
      indicatorType: null,
      indicatorParams: null,
      pinnedTo: null,
    }
  }

  _newTabName() {
    return `New${this._nextNewTabNumber()}`
  }

  _nextNewTabNumber() {
    let max = 0
    for (const tab of this.tabs) {
      if (!tab.name) continue
      const match = tab.name.match(/^New(\d+)$/)
      if (!match) continue
      const num = parseInt(match[1], 10)
      if (!Number.isNaN(num) && num > max) max = num
    }
    return max + 1
  }

  _normalizeColorScheme(colorScheme) {
    const num = parseInt(colorScheme, 10)
    if (Number.isNaN(num) || num < 0) return 0
    return num % OVERLAY_COLORS.length
  }

  _normalizeOpacity(opacity) {
    const value = parseFloat(opacity)
    if (Number.isNaN(value)) return 1
    if (value < 0) return 0
    if (value > 1) return 1
    return Math.round(value * 100) / 100
  }

  _save() {
    saveTabs(this.tabs)
    saveActiveTabId(this.activeTabId)
  }
}
