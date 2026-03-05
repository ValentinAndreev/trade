import { OVERLAY_COLORS } from "../config/theme"
import { normalizeColorScheme, normalizeOpacity } from "../utils/color"
import { loadTabs, saveTabs, calcNextId, loadActiveTabId, saveActiveTabId } from "./persistence"
import type { Tab, Panel, Overlay, DrawingKind, DrawingItem } from "../types/store"

const DRAWING_PREFIX: Record<DrawingKind, string> = { labels: "lbl", lines: "ln", hlines: "hl", vlines: "vl" }

export default class TabStore {
  tabs: Tab[]
  activeTabId: string | null
  selectedPanelId: string | null
  selectedOverlayId: string | null
  _nextTabId: number
  _nextPanelId: number
  _nextOverlayId: number
  _nextDrawingId: Record<string, number>

  constructor() {
    this.tabs = loadTabs()
    const tabNums = this.tabs.map(t => parseInt(t.id.split("-")[1]))
    this._nextTabId = tabNums.length ? Math.max(...tabNums) + 1 : 1
    this._nextPanelId = calcNextId(this.tabs, "p")
    this._nextOverlayId = calcNextId(this.tabs, "o")
    this._nextDrawingId = {}
    for (const kind of Object.keys(DRAWING_PREFIX)) {
      this._nextDrawingId[kind] = this._calcNextDrawingId(kind)
    }

    const savedTabId = loadActiveTabId()
    const savedTab = savedTabId && this.tabs.find(t => t.id === savedTabId)
    const activeTab = savedTab || this.tabs[0]
    this.activeTabId = activeTab?.id || null
    this.selectedPanelId = activeTab?.panels[0]?.id || null
    this.selectedOverlayId = activeTab?.panels[0]?.overlays[0]?.id || null
  }

  // --- Tabs ---

  addTab({ symbol = null }: { symbol?: string | null } = {}): Tab {
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

  removeTab(tabId: string): boolean {
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

  activateTab(tabId: string): boolean {
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

  renameTab(tabId: string, name: string | null): boolean {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return false
    tab.name = name || null
    this._save()
    return true
  }

  tabLabel(tab: Tab): string {
    if (tab.name) return tab.name
    const first = tab.panels[0]
    const firstOverlay = first?.overlays[0]
    return firstOverlay?.symbol ? `${firstOverlay.symbol} ${first.timeframe}` : "New"
  }

  get activeTab() {
    return this.tabs.find(t => t.id === this.activeTabId)
  }

  // --- Panels ---

  addPanel(tabId: string): Panel | null {
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

  removePanel(panelId: string): boolean {
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

  selectPanel(panelId: string): boolean {
    if (panelId === this.selectedPanelId) return false
    this.selectedPanelId = panelId
    const panel = this.selectedPanel
    if (panel && !panel.overlays.find(o => o.id === this.selectedOverlayId)) {
      this.selectedOverlayId = panel.overlays[0]?.id || null
    }
    return true
  }

  movePanelUp(panelId: string): boolean {
    return this._swapPanel(panelId, -1)
  }

  movePanelDown(panelId: string): boolean {
    return this._swapPanel(panelId, 1)
  }

  _swapPanel(panelId: string, direction: number): boolean {
    for (const tab of this.tabs) {
      const idx = tab.panels.findIndex(p => p.id === panelId)
      if (idx === -1) continue
      const targetIdx = idx + direction
      if (targetIdx < 0 || targetIdx >= tab.panels.length) return false;
      [tab.panels[idx], tab.panels[targetIdx]] = [tab.panels[targetIdx], tab.panels[idx]]
      this._save()
      return true
    }
    return false
  }

  updatePanelTimeframe(panelId: string, timeframe: string): boolean {
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

  addOverlay(panelId: string): Overlay | null {
    const panel = this._findPanel(panelId)
    if (!panel) return null
    const colorScheme = panel.overlays.length % OVERLAY_COLORS.length
    const overlay = this._newOverlay(`o-${this._nextOverlayId++}`, null, colorScheme)
    panel.overlays.push(overlay)
    this.selectedOverlayId = overlay.id
    this._save()
    return overlay
  }

  removeOverlay(panelId: string, overlayId: string): boolean {
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

  selectOverlay(overlayId: string): boolean {
    if (overlayId === this.selectedOverlayId) return false
    this.selectedOverlayId = overlayId
    return true
  }

  updateOverlaySymbol(overlayId: string, symbol: string | null): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay || overlay.symbol === symbol) return false
    overlay.symbol = symbol
    this._save()
    return true
  }

  setOverlayMode(overlayId: string, mode: "price" | "volume" | "indicator"): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay || overlay.mode === mode) return false
    overlay.mode = mode
    if (mode === "indicator") {
      if (!overlay.indicatorType) {
        overlay.indicatorType = "sma"
        overlay.indicatorParams = { period: 20 }
      }
      // Auto-pin to source overlay on same panel
      if (!overlay.pinnedTo) {
        const panel = this._findPanelForOverlay(overlayId)
        if (panel) {
          const source = panel.overlays.find(o => o.id !== overlayId && o.symbol)
          overlay.pinnedTo = source ? source.id : (overlay.symbol ? overlayId : null)
        }
      }
    } else {
      overlay.pinnedTo = null
    }
    this._save()
    return true
  }

  setOverlayPinnedTo(overlayId: string, pinnedTo: string | null): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    overlay.pinnedTo = pinnedTo || null
    this._save()
    return true
  }

  setOverlayIndicatorType(overlayId: string, type: string, source?: string): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    overlay.indicatorType = type
    if (source !== undefined) overlay.indicatorSource = source
    this._save()
    return true
  }

  setOverlayIndicatorParams(overlayId: string, params: Record<string, number | string> | null): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    overlay.indicatorParams = params ? { ...params } : null
    this._save()
    return true
  }

  setOverlayChartType(overlayId: string, chartType: string): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay || overlay.chartType === chartType) return false
    overlay.chartType = chartType
    this._save()
    return true
  }

  setOverlayVisible(overlayId: string, visible: boolean): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    const normalized = visible !== false
    if (overlay.visible === normalized) return false
    overlay.visible = normalized
    this._save()
    return true
  }

  setOverlayColorScheme(overlayId: string, colorScheme: number): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    const normalized = normalizeColorScheme(colorScheme)
    if (overlay.colorScheme === normalized) return false
    overlay.colorScheme = normalized
    this._save()
    return true
  }

  setOverlayOpacity(overlayId: string, opacity: number): boolean {
    const overlay = this._findOverlay(overlayId)
    if (!overlay) return false
    const normalized = normalizeOpacity(opacity)
    if (overlay.opacity === normalized) return false
    overlay.opacity = normalized
    this._save()
    return true
  }

  get selectedOverlay() {
    return this._findOverlay(this.selectedOverlayId)
  }

  overlayById(overlayId: string | null): Overlay | null {
    return this._findOverlay(overlayId)
  }

  _findOverlay(overlayId: string | null): Overlay | null {
    for (const tab of this.tabs) {
      for (const panel of tab.panels) {
        const overlay = panel.overlays.find(o => o.id === overlayId)
        if (overlay) return overlay
      }
    }
    return null
  }

  _findPanelForOverlay(overlayId: string): Panel | null {
    for (const tab of this.tabs) {
      for (const panel of tab.panels) {
        if (panel.overlays.some(o => o.id === overlayId)) return panel
      }
    }
    return null
  }

  _findPanel(panelId: string | null): Panel | null {
    for (const tab of this.tabs) {
      const panel = tab.panels.find(p => p.id === panelId)
      if (panel) return panel
    }
    return null
  }

  // --- Generic drawing CRUD ---

  addDrawing(panelId: string, kind: DrawingKind, data: Partial<DrawingItem>): DrawingItem | null {
    const panel = this._findPanel(panelId)
    if (!panel) return null
    if (!panel[kind]) panel[kind] = []
    const prefix = DRAWING_PREFIX[kind]
    const item = { id: `${prefix}-${this._nextDrawingId[kind]++}`, ...data }
    panel[kind].push(item)
    this._save()
    return item
  }

  removeDrawing(panelId: string, kind: DrawingKind, itemId: string): boolean {
    const panel = this._findPanel(panelId)
    if (!panel || !panel[kind]) return false
    const idx = panel[kind].findIndex(i => i.id === itemId)
    if (idx === -1) return false
    panel[kind].splice(idx, 1)
    this._save()
    return true
  }

  updateDrawing(panelId: string, kind: DrawingKind, itemId: string, updates: Partial<DrawingItem>): boolean {
    const panel = this._findPanel(panelId)
    if (!panel || !panel[kind]) return false
    const item = panel[kind].find(i => i.id === itemId)
    if (!item) return false
    Object.assign(item, updates)
    this._save()
    return true
  }

  clearDrawings(panelId: string, kind: DrawingKind): void {
    const panel = this._findPanel(panelId)
    if (!panel) return
    panel[kind] = []
    this._save()
  }

  clearAllDrawings(panelId: string): void {
    const panel = this._findPanel(panelId)
    if (!panel) return
    for (const kind of Object.keys(DRAWING_PREFIX) as DrawingKind[]) panel[kind] = []
    this._save()
  }

  // --- Volume Profile ---

  setVolumeProfile(panelId: string, settings: Partial<{ enabled: boolean; opacity: number }>): boolean {
    const panel = this._findPanel(panelId)
    if (!panel) return false
    panel.volumeProfile = { enabled: true, opacity: 0.3, ...(panel.volumeProfile || {}), ...settings }
    this._save()
    return true
  }

  _newOverlay(id: string, symbol: string | null = null, colorScheme: number = 0): Overlay {
    return {
      id,
      symbol,
      mode: "price",
      chartType: "Candlestick",
      visible: true,
      colorScheme: normalizeColorScheme(colorScheme),
      opacity: 1,
      indicatorType: null,
      indicatorParams: null,
      pinnedTo: null,
    }
  }

  _calcNextDrawingId(kind: string): number {
    let max = 0
    for (const tab of this.tabs) {
      for (const panel of tab.panels) {
        const arr = panel[kind] as DrawingItem[] | undefined
        if (!Array.isArray(arr)) continue
        for (const item of arr) {
          const num = parseInt(item.id.split("-")[1])
          if (num > max) max = num
        }
      }
    }
    return max + 1
  }

  _newTabName(): string {
    return `New${this._nextNewTabNumber()}`
  }

  _nextNewTabNumber(): number {
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

  _save(): void {
    saveTabs(this.tabs)
    if (this.activeTabId) saveActiveTabId(this.activeTabId)
  }
}
