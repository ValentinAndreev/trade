import { OVERLAY_COLORS } from "../config/theme"
import { normalizeColorScheme, normalizeOpacity } from "../utils/color"
import { loadTabs, saveTabs, calcNextId, loadActiveTabId, saveActiveTabId } from "./persistence"
import type { Tab, Panel, Overlay, DrawingKind, DrawingItem, DataConfig, DataColumn, Condition, ChartLink, TradingSystem } from "../types/store"

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

  _nextConditionId: number
  _nextColumnId: number
  _nextSystemId: number

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
    this._nextConditionId = this._calcNextDataId("cond")
    this._nextColumnId = this._calcNextDataId("col")
    this._nextSystemId = this._calcNextSystemId()

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
    const tab: Tab = {
      id: `tab-${this._nextTabId++}`,
      name: null,
      type: "chart",
      primaryPanelId: panelId,
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

    this._cleanupChartLinks(tabId)

    if (this.activeTabId === tabId) {
      const newTab = this.tabs[Math.min(idx, this.tabs.length - 1)]
      this.activeTabId = newTab.id
      if (newTab.type === "data") {
        this.selectedPanelId = null
        this.selectedOverlayId = null
      } else {
        this.selectedPanelId = newTab.panels[0]?.id || null
        this.selectedOverlayId = newTab.panels[0]?.overlays[0]?.id || null
      }
    }
    this._save()
    return true
  }

  activateTab(tabId: string): boolean {
    if (tabId === this.activeTabId) return false
    this.activeTabId = tabId
    const tab = this.activeTab
    if (tab) {
      if (tab.type === "data") {
        this.selectedPanelId = null
        this.selectedOverlayId = null
      } else if (!tab.panels.find(p => p.id === this.selectedPanelId)) {
        this.selectedPanelId = tab.panels[0]?.id || null
        this.selectedOverlayId = tab.panels[0]?.overlays[0]?.id || null
      }
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
    if (tab.type === "system_stats") {
      return tab.name || "Stats"
    }
    if (tab.type === "data") {
      const base = tab.name || this._autoDataName(tab)
      const symbol = tab.dataConfig?.symbols?.[0] || ""
      const tf = tab.dataConfig?.timeframe || ""
      const info = [symbol, tf].filter(Boolean).join(" ")
      return info ? `${base} (${info})` : base
    }
    if (tab.name) return tab.name
    const primary = this.primaryPanel(tab)
    const primaryOverlay = primary?.overlays[0]
    if (primaryOverlay?.symbol && primary?.timeframe) return `${primaryOverlay.symbol} ${primary.timeframe}`
    return "New"
  }

  tabBaseName(tab: Tab): string {
    if (tab.type === "data") return tab.name || this._autoDataName(tab)
    return tab.name || this.tabLabel(tab)
  }

  private _autoDataName(tab: Tab): string {
    const dataTabs = this.tabs.filter(t => t.type === "data").sort((a, b) => a.id.localeCompare(b.id))
    const idx = dataTabs.findIndex(t => t.id === tab.id)
    return `Data${idx >= 0 ? idx + 1 : 1}`
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
      this._cleanupPanelLinks(panelId)
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

  /** Returns the primary panel for a chart tab — stable regardless of panel reorder. */
  primaryPanel(tab: Tab): Panel | null {
    if (!tab.panels.length) return null
    if (tab.primaryPanelId) {
      return tab.panels.find(p => p.id === tab.primaryPanelId) ?? tab.panels[0]
    }
    return tab.panels[0]
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
    this._syncTimeframeToLinkedData(panelId, timeframe)
    this._save()
    return true
  }

  private _syncTimeframeToLinkedData(panelId: string, timeframe: string): void {
    const chartTab = this.tabs.find(t => t.type === "chart" && t.panels.some(p => p.id === panelId))
    if (!chartTab) return
    for (const dataTab of this.tabs) {
      if (dataTab.type !== "data" || !dataTab.dataConfig?.chartLinks) continue
      const linked = dataTab.dataConfig.chartLinks.some(l => l.chartTabId === chartTab.id && l.panelId === panelId)
      if (linked) dataTab.dataConfig.timeframe = timeframe
    }
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

  isPrimaryOverlay(panelId: string, overlayId: string): boolean {
    const panel = this._findPanel(panelId)
    if (!panel?.overlays.length) return false
    return panel.overlays[0].id === overlayId
  }

  removeOverlay(panelId: string, overlayId: string): boolean {
    const panel = this._findPanel(panelId)
    if (!panel) return false
    if (this.isPrimaryOverlay(panelId, overlayId)) return false
    const overlay = panel.overlays.find(o => o.id === overlayId)
    if (!overlay) return false
    const wasPriceOverlay = overlay.mode !== "indicator" && !!overlay.symbol
    const idx = panel.overlays.findIndex(o => o.id === overlayId)
    panel.overlays.splice(idx, 1)
    if (panel.overlays.length === 0) {
      const fresh = this._newOverlay(`o-${this._nextOverlayId++}`, null, 0)
      panel.overlays.push(fresh)
      this.selectedOverlayId = fresh.id
    } else if (this.selectedOverlayId === overlayId) {
      this.selectedOverlayId = panel.overlays[Math.min(idx, panel.overlays.length - 1)].id
    }
    if (wasPriceOverlay) {
      const chartTab = this.tabs.find(t => t.type === "chart" && t.panels.some(p => p.id === panelId))
      if (chartTab) this._cleanupChartLinks(chartTab.id)
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
    const panel = this._findPanelForOverlay(overlayId)
    if (panel && this.isPrimaryOverlay(panel.id, overlayId) && mode !== "price") return false
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

  // --- Data Tabs ---

  addDataTab({ symbols = [], timeframe = "1m", sourceTabId, extraColumns = [] }: { symbols?: string[]; timeframe?: string; sourceTabId?: string; extraColumns?: DataColumn[] } = {}): Tab {
    const prefix = (sourceTabId && symbols[0]) ? `${symbols[0].toLowerCase()}_` : ""
    const defaultColumns: DataColumn[] = [
      { id: `col-${this._nextColumnId++}`, type: "datetime", label: "time" },
      { id: `col-${this._nextColumnId++}`, type: "open", label: `${prefix}open` },
      { id: `col-${this._nextColumnId++}`, type: "high", label: `${prefix}high` },
      { id: `col-${this._nextColumnId++}`, type: "low", label: `${prefix}low` },
      { id: `col-${this._nextColumnId++}`, type: "close", label: `${prefix}close` },
      { id: `col-${this._nextColumnId++}`, type: "volume", label: `${prefix}volume` },
    ]

    const chartLinks: { chartTabId: string; panelId: string }[] = []

    if (sourceTabId) {
      const sourceChart = this.tabs.find(t => t.id === sourceTabId && t.type === "chart")
      if (sourceChart) {
        for (const panel of sourceChart.panels) {
          chartLinks.push({ chartTabId: sourceTabId, panelId: panel.id })
        }
      }
    }

    const dataTabCount = this.tabs.filter(t => t.type === "data").length
    const tab: Tab = {
      id: `tab-${this._nextTabId++}`,
      name: `Data${dataTabCount + 1}`,
      type: "data",
      panels: [],
      dataConfig: {
        symbols,
        timeframe,
        columns: [...defaultColumns, ...extraColumns],
        conditions: [],
        systems: [],
        chartLinks,
        sourceTabId,
      },
    }
    if (sourceTabId) {
      const chartIdx = this.tabs.findIndex(t => t.id === sourceTabId)
      if (chartIdx !== -1) {
        let insertIdx = chartIdx + 1
        while (insertIdx < this.tabs.length && this.tabs[insertIdx].type === "data" && this.tabs[insertIdx].dataConfig?.chartLinks?.some(l => l.chartTabId === sourceTabId)) {
          insertIdx++
        }
        this.tabs.splice(insertIdx, 0, tab)
      } else {
        this.tabs.push(tab)
      }
    } else {
      this.tabs.push(tab)
    }
    this.activeTabId = tab.id
    this.selectedPanelId = null
    this.selectedOverlayId = null
    this._save()
    return tab
  }

  addDataTabFromChart(chartTabId: string): Tab | null {
    const chart = this.tabs.find(t => t.id === chartTabId && t.type === "chart")
    if (!chart) return null

    const primary = this.primaryPanel(chart)
    const symbols: string[] = []
    const indicatorColumns: DataColumn[] = []
    const timeframe = primary?.timeframe || "1m"

    // Primary panel's symbol comes first (stable, regardless of panel order)
    const orderedPanels = primary
      ? [primary, ...chart.panels.filter(p => p.id !== primary.id)]
      : chart.panels

    for (const panel of orderedPanels) {
      for (const overlay of panel.overlays) {
        if (overlay.symbol && !symbols.includes(overlay.symbol)) {
          symbols.push(overlay.symbol)
        }
        if (overlay.mode === "indicator" && overlay.indicatorType) {
          const params = overlay.indicatorParams || {}
          const paramStr = Object.values(params).join("_")
          const fieldName = paramStr ? `${overlay.indicatorType}_${paramStr}` : overlay.indicatorType
          indicatorColumns.push({
            id: `col-${this._nextColumnId++}`,
            type: "indicator",
            label: fieldName,
            indicatorType: overlay.indicatorType,
            indicatorParams: params,
          })
        }
      }
    }

    return this.addDataTab({ symbols, timeframe, sourceTabId: chartTabId, extraColumns: indicatorColumns })
  }

  moveTabNextToChart(dataTabId: string, chartTabId: string): void {
    const dataIdx = this.tabs.findIndex(t => t.id === dataTabId)
    const chartIdx = this.tabs.findIndex(t => t.id === chartTabId)
    if (dataIdx === -1 || chartIdx === -1) return
    const [dataTab] = this.tabs.splice(dataIdx, 1)
    if (!dataTab) return
    const newChartIdx = this.tabs.findIndex(t => t.id === chartTabId)
    let insertIdx = newChartIdx + 1
    while (insertIdx < this.tabs.length && this.tabs[insertIdx].type === "data" && this.tabs[insertIdx].dataConfig?.chartLinks?.some(l => l.chartTabId === chartTabId)) {
      insertIdx++
    }
    this.tabs.splice(insertIdx, 0, dataTab)
    this._save()
  }

  isLinkedDataTab(tab: Tab): boolean {
    return tab.type === "data" && !!tab.dataConfig?.chartLinks?.length
  }

  /** Move unlinked data tab to right after its former group (chart + remaining linked data tabs). */
  moveUnlinkedTabAfterGroup(dataTabId: string, chartTabId: string): void {
    const tabIdx = this.tabs.findIndex((t) => t.id === dataTabId)
    if (tabIdx === -1) return
    const [tab] = this.tabs.splice(tabIdx, 1)
    if (!tab) return
    const chartIdx = this.tabs.findIndex((t) => t.id === chartTabId && t.type === "chart")
    if (chartIdx === -1) {
      this.tabs.push(tab)
      this._save()
      return
    }
    let insertAfter = chartIdx
    let i = chartIdx + 1
    while (i < this.tabs.length && this.tabs[i].type === "data" && this.tabs[i].dataConfig?.chartLinks?.some((l: ChartLink) => l.chartTabId === chartTabId)) {
      insertAfter = i
      i++
    }
    this.tabs.splice(insertAfter + 1, 0, tab)
    this._save()
  }

  /** Returns [chartTabId, ...linkedDataTabIds] if tab is chart or linked data; else [tabId]. */
  getTabGroupForDrag(tabId: string): string[] {
    const tab = this.tabs.find(t => t.id === tabId)
    if (!tab) return [tabId]
    if (tab.type === "chart") {
      const group: string[] = [tab.id]
      let i = this.tabs.findIndex(t => t.id === tabId) + 1
      while (i < this.tabs.length && this.tabs[i].type === "data" && this.tabs[i].dataConfig?.chartLinks?.some((l: ChartLink) => l.chartTabId === tabId)) {
        group.push(this.tabs[i].id)
        i++
      }
      return group
    }
    if (tab.type === "data" && tab.dataConfig?.chartLinks?.length) {
      const chartId = tab.dataConfig.chartLinks[0].chartTabId
      return this.getTabGroupForDrag(chartId)
    }
    return [tabId]
  }

  /**
   * Normalize drop target so we never insert inside a linked group.
   * Returns [tabId, insertBefore] to insert before that tab or after it.
   */
  private _normalizeDropTarget(dropTargetTabId: string, insertBefore: boolean): [string, boolean] {
    const group = this.getTabGroupForDrag(dropTargetTabId)
    if (group.length <= 1) return [dropTargetTabId, insertBefore]
    const groupSet = new Set(group)
    const lastGroupIdx = this.tabs.findIndex(t => t.id === group[group.length - 1])
    if (insertBefore) return [group[0], true]
    if (lastGroupIdx >= 0 && lastGroupIdx + 1 < this.tabs.length) return [this.tabs[lastGroupIdx + 1].id, true]
    return [group[group.length - 1], false]
  }

  /** Move tab (or chart+linked group) to before/after dropTargetTabId. Never inserts inside a linked group. */
  reorderTabs(dragTabId: string, dropTargetTabId: string, insertBefore: boolean): boolean {
    const [canonTarget, canonBefore] = this._normalizeDropTarget(dropTargetTabId, insertBefore)
    const toMove = this.getTabGroupForDrag(dragTabId)
    if (toMove.includes(canonTarget)) return false
    const moveSet = new Set(toMove)
    const rest = this.tabs.filter(t => !moveSet.has(t.id))
    const movedTabs = this.tabs.filter(t => moveSet.has(t.id))
    const order = [...toMove]
    const orderedMoved = order.map(id => movedTabs.find(t => t.id === id)).filter(Boolean) as Tab[]
    if (orderedMoved.length === 0) return false
    const dropIdx = rest.findIndex(t => t.id === canonTarget)
    if (dropIdx === -1) return false
    const insertIdx = canonBefore ? dropIdx : dropIdx + 1
    this.tabs = [...rest.slice(0, insertIdx), ...orderedMoved, ...rest.slice(insertIdx)]
    this._save()
    return true
  }

  updateDataConfig(tabId: string, updates: Partial<DataConfig>): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab || !tab.dataConfig) return false
    Object.assign(tab.dataConfig, updates)
    if (updates.timeframe != null && tab.dataConfig.chartLinks?.length) {
      const tf = tab.dataConfig.timeframe
      this._syncTimeframeToChart(tf, tab.dataConfig.chartLinks)
      this._syncTimeframeToOtherDataTabs(tabId, tf, tab.dataConfig.chartLinks)
    }
    this._save()
    return true
  }

  private _syncTimeframeToChart(timeframe: string, chartLinks: Array<{ chartTabId: string; panelId: string }>): void {
    for (const link of chartLinks) {
      const chartTab = this.tabs.find(t => t.id === link.chartTabId && t.type === "chart")
      const panel = chartTab?.panels.find(p => p.id === link.panelId)
      if (panel) panel.timeframe = timeframe
    }
  }

  private _syncTimeframeToOtherDataTabs(excludeTabId: string, timeframe: string, chartLinks: Array<{ chartTabId: string; panelId: string }>): void {
    const linkSet = new Set(chartLinks.map(l => `${l.chartTabId}:${l.panelId}`))
    for (const dataTab of this.tabs) {
      if (dataTab.type !== "data" || dataTab.id === excludeTabId || !dataTab.dataConfig?.chartLinks) continue
      const hasSameLink = dataTab.dataConfig.chartLinks.some(l => linkSet.has(`${l.chartTabId}:${l.panelId}`))
      if (hasSameLink) dataTab.dataConfig.timeframe = timeframe
    }
  }

  reorderDataColumns(tabId: string, columnIds: string[], widths?: Record<string, number>): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig?.columns.length) return false
    const byId = new Map(tab.dataConfig.columns.map(c => [c.id, c]))
    const reordered: DataColumn[] = []
    for (const id of columnIds) {
      const col = byId.get(id)
      if (col) {
        if (widths && widths[id] != null) col.width = widths[id]
        reordered.push(col)
      }
    }
    const rest = tab.dataConfig.columns.filter(c => !reordered.some(r => r.id === c.id))
    tab.dataConfig.columns = [...reordered, ...rest]
    this._save()
    return true
  }

  addDataColumn(tabId: string, column: Omit<DataColumn, "id">): DataColumn | null {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return null
    const col: DataColumn = { id: `col-${this._nextColumnId++}`, ...column }
    tab.dataConfig.columns.push(col)
    this._save()
    return col
  }

  removeDataColumn(tabId: string, columnId: string): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return false
    const idx = tab.dataConfig.columns.findIndex(c => c.id === columnId)
    if (idx === -1) return false
    tab.dataConfig.columns.splice(idx, 1)
    this._save()
    return true
  }

  setDataColumnVisible(tabId: string, columnId: string, visible: boolean): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return false
    const col = tab.dataConfig.columns.find(c => c.id === columnId)
    if (!col) return false
    col.visible = visible
    this._save()
    return true
  }

  addCondition(tabId: string, condition: Omit<Condition, "id">): Condition | null {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return null
    const cond: Condition = { id: `cond-${this._nextConditionId++}`, ...condition }
    tab.dataConfig.conditions.push(cond)
    this._save()
    return cond
  }

  updateCondition(tabId: string, conditionId: string, updates: Partial<Condition>): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return false
    const cond = tab.dataConfig.conditions.find(c => c.id === conditionId)
    if (!cond) return false
    Object.assign(cond, updates)
    this._save()
    return true
  }

  removeCondition(tabId: string, conditionId: string): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return false
    const idx = tab.dataConfig.conditions.findIndex(c => c.id === conditionId)
    if (idx === -1) return false
    tab.dataConfig.conditions.splice(idx, 1)
    this._save()
    return true
  }

  addSystem(tabId: string, system: Omit<TradingSystem, "id">): TradingSystem | null {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return null
    if (!tab.dataConfig.systems) tab.dataConfig.systems = []
    const sys: TradingSystem = { id: `sys-${this._nextSystemId++}`, ...system }
    tab.dataConfig.systems.push(sys)
    this._save()
    return sys
  }

  updateSystem(tabId: string, systemId: string, updates: Partial<TradingSystem>): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return false
    const sys = (tab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!sys) return false
    Object.assign(sys, updates)
    this._save()
    return true
  }

  removeSystem(tabId: string, systemId: string): boolean {
    const tab = this.tabs.find(t => t.id === tabId && t.type === "data")
    if (!tab?.dataConfig) return false
    const arr = tab.dataConfig.systems ?? []
    const idx = arr.findIndex(s => s.id === systemId)
    if (idx === -1) return false
    arr.splice(idx, 1)
    tab.dataConfig.systems = arr
    // Remove associated system_stats tab
    const statsIdx = this.tabs.findIndex(
      t => t.type === "system_stats" && t.systemStatsConfig?.systemId === systemId
    )
    if (statsIdx !== -1) this.tabs.splice(statsIdx, 1)
    this._save()
    return true
  }

  _calcNextDataId(prefix: string): number {
    let max = 0
    for (const tab of this.tabs) {
      if (tab.type !== "data" || !tab.dataConfig) continue
      const items = prefix === "col" ? tab.dataConfig.columns : tab.dataConfig.conditions
      for (const item of items) {
        const parts = item.id.split("-")
        const num = parseInt(parts[parts.length - 1])
        if (num > max) max = num
      }
    }
    return max + 1
  }

  addSystemStatsTab(systemId: string, dataTabId: string, systemName: string): Tab {
    const existing = this.tabs.find(
      t => t.type === "system_stats" && t.systemStatsConfig?.systemId === systemId
    )
    if (existing) {
      this.activeTabId = existing.id
      this._save()
      return existing
    }

    const tab: Tab = {
      id: `tab-${this._nextTabId++}`,
      name: `Stats: ${systemName}`,
      type: "system_stats",
      panels: [],
      systemStatsConfig: { systemId, dataTabId },
    }

    // Insert after the data tab
    const dataIdx = this.tabs.findIndex(t => t.id === dataTabId)
    if (dataIdx !== -1) {
      this.tabs.splice(dataIdx + 1, 0, tab)
    } else {
      this.tabs.push(tab)
    }
    this.activeTabId = tab.id
    this._save()
    return tab
  }

  private _calcNextSystemId(): number {
    let max = 0
    for (const tab of this.tabs) {
      if (tab.type !== "data" || !tab.dataConfig) continue
      for (const sys of (tab.dataConfig.systems ?? [])) {
        const n = parseInt(sys.id.split("-").pop() ?? "0")
        if (n > max) max = n
      }
    }
    return max + 1
  }

  private _cleanupChartLinks(removedTabId: string): void {
    for (const tab of this.tabs) {
      if (tab.type !== "data" || !tab.dataConfig) continue
      if (tab.dataConfig.sourceTabId === removedTabId) {
        tab.dataConfig.sourceTabId = undefined
      }
      const links = tab.dataConfig.chartLinks
      if (!links) continue
      tab.dataConfig.chartLinks = links.filter(l => l.chartTabId !== removedTabId)
    }
  }

  private _cleanupPanelLinks(removedPanelId: string): void {
    for (const tab of this.tabs) {
      if (tab.type !== "data" || !tab.dataConfig?.chartLinks) continue
      tab.dataConfig.chartLinks = tab.dataConfig.chartLinks.filter(l => l.panelId !== removedPanelId)
    }
  }

  _save(): void {
    saveTabs(this.tabs)
    if (this.activeTabId) saveActiveTabId(this.activeTabId)
  }
}
