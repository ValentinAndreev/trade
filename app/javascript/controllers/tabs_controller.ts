import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"
import { startPanelResize } from "../tabs/panel_resizer"
import DrawingActions from "../tabs/drawing_actions"
import DataTabActions from "../tabs/data_actions"
import ChartSidebarActions from "../tabs/chart_sidebar_actions"
import ChartBridge from "../data_grid/chart_bridge"
import { generateTrades, computeSystemStats } from "../data_grid/system_engine"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"
import type { Panel, DrawingKind, DrawingItem, ChartControllerAPI, LabelMarkerInput, DataGridControllerAPI, StimulusApp } from "../types/store"
import { LINKED_DATA_REFRESH_MS, SYSTEM_STATS_RETRY_DELAY_MS, SYSTEM_STATS_MAX_RETRIES } from "../config/constants"

export default class extends Controller {
  static targets = ["tabBar", "panels", "sidebar"]

  declare tabBarTarget: HTMLElement
  declare panelsTarget: HTMLElement
  declare sidebarTarget: HTMLElement

  store!: TabStore
  config!: { symbols: string[]; timeframes: string[]; indicators: IndicatorInfo[] }
  renderer!: TabRenderer
  drawingActions!: DrawingActions
  chartBridge!: ChartBridge
  dataActions!: DataTabActions
  chartActions!: ChartSidebarActions
  private _boundListeners: Record<string, (e: Event) => void> | null = null
  private _linkedDataRefreshInterval: ReturnType<typeof setInterval> | null = null
  private _tabDragJustEnded = false

  async connect() {
    this.store = new TabStore()
    this.config = await fetchConfig()
    this.renderer = new TabRenderer(this.tabBarTarget, this.panelsTarget, this.sidebarTarget, {
      controllerName: "tabs",
    })
    this.drawingActions = new DrawingActions(
      this.store,
      () => this.store.selectedPanel,
      (panelId) => this._chartCtrlForPanel(panelId),
      () => this.render(),
    )
    this.chartBridge = new ChartBridge(this.panelsTarget, this.application)
    this.dataActions = new DataTabActions({
      store: this.store,
      renderer: this.renderer,
      chartBridge: this.chartBridge,
      sidebarTarget: this.sidebarTarget,
      panelsTarget: this.panelsTarget,
      element: this.element as HTMLElement,
      config: this.config,
      application: this.application,
      renderFn: () => this.render(),
    })
    this.chartActions = new ChartSidebarActions({
      store: this.store,
      renderer: this.renderer,
      sidebarTarget: this.sidebarTarget,
      chartCtrlFn: () => this._getSelectedChartCtrl(),
      renderFn: () => this.render(),
    })
    if (this.config.indicators?.length) {
      this.renderer.dataSidebar.availableIndicators = this.config.indicators as IndicatorInfo[]
    }
    this.render()

    this._boundListeners = {
      label:  (e) => this._onDrawingCreated("labels", e),
      line:   (e) => this._onLineCreated(e),
      hline:  (e) => this._onDrawingCreated("hlines", e, (d) => `${d.symbol || "HL"} HL`),
      vline:  (e) => this._onDrawingCreated("vlines", e, (d) => `${d.symbol || "VL"} VL`),
      open:   (e) => this._onOpenSymbol(e),
      rowClick: (e) => this.dataActions.onDataGridRowClick(e),
      timeRange: (e) => this.dataActions.onDataGridTimeRange(e),
      gridLoaded: () => this.dataActions.onDataGridLoaded(),
      startLinkedDataRefresh: () => this._startLinkedDataRefreshIfActive(),
      columnStateChanged: (e: Event) => this._onDataGridColumnStateChanged(e),
      openSystemStats: (e: Event) => this._onOpenSystemStats(e),
      requestStats: (e: Event) => this._onSystemStatsRequest(e),
    }
    this.element.addEventListener("label:created", this._boundListeners.label)
    this.element.addEventListener("line:created", this._boundListeners.line)
    this.element.addEventListener("hline:created", this._boundListeners.hline)
    this.element.addEventListener("vline:created", this._boundListeners.vline)
    this.element.addEventListener("tabs:openSymbol", this._boundListeners.open)
    this.element.addEventListener("datagrid:rowclick", this._boundListeners.rowClick)
    this.element.addEventListener("datagrid:timerange", this._boundListeners.timeRange)
    this.element.addEventListener("datagrid:loaded", this._boundListeners.gridLoaded)
    this.element.addEventListener("tabs:startLinkedDataRefresh", this._boundListeners.startLinkedDataRefresh)
    this.element.addEventListener("datagrid:columnStateChanged", this._boundListeners.columnStateChanged as EventListener)
    this.element.addEventListener("datatab:openSystemStats", this._boundListeners.openSystemStats as EventListener)
    this.element.addEventListener("systemstats:requestStats", this._boundListeners.requestStats as EventListener)
  }

  private _onDataGridColumnStateChanged(e: Event) {
    const detail = (e as CustomEvent<{ tabId: string; columnIds: string[]; widths?: Record<string, number> }>).detail
    const tabId = detail?.tabId
    if (tabId && detail?.columnIds?.length && this.store.reorderDataColumns(tabId, detail.columnIds, detail.widths)) {
      this.render()
    }
  }

  private _onOpenSystemStats(e: Event) {
    const { systemId } = (e as CustomEvent<{ systemId: string }>).detail
    const dataTab = this.store.activeTab
    if (!dataTab || dataTab.type !== "data" || !dataTab.dataConfig) return
    const system = (dataTab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!system) return
    this.store.addSystemStatsTab(systemId, dataTab.id, system.name)
    this.render()
    // Immediately provide stats
    this._deliverSystemStats(systemId, dataTab.id)
  }

  private _onSystemStatsRequest(e: Event) {
    const { systemId, dataTabId } = (e as CustomEvent<{ systemId: string; dataTabId: string }>).detail
    this._deliverSystemStats(systemId, dataTabId)
  }

  private _deliverSystemStats(systemId: string, dataTabId: string, attempt = 0) {
    const dataTab = this.store.tabs.find(t => t.id === dataTabId)
    if (!dataTab?.dataConfig) return
    const system = (dataTab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!system) return

    const app = this.application as StimulusApp

    // Find the data grid controller for this data tab
    const dataWrapper = this.panelsTarget.querySelector(`[data-tab-wrapper="${dataTabId}"]`) as HTMLElement | null
    const gridEl = dataWrapper?.querySelector("[data-controller='data-grid']") as HTMLElement | null
    const gridCtrl = gridEl
      ? app.getControllerForElementAndIdentifier(gridEl, "data-grid") as DataGridControllerAPI | null
      : null

    const rows = gridCtrl?.getData() ?? []

    // Retry up to SYSTEM_STATS_MAX_RETRIES if grid isn't ready or has no data yet
    if ((!gridCtrl || !rows.length) && attempt < SYSTEM_STATS_MAX_RETRIES) {
      setTimeout(() => this._deliverSystemStats(systemId, dataTabId, attempt + 1), SYSTEM_STATS_RETRY_DELAY_MS)
      return
    }

    const trades = generateTrades(system, rows)
    const stats = computeSystemStats(trades)

    // Find stats controller
    const statsWrapper = this.panelsTarget.querySelector(`[data-system-stats-system-id-value="${systemId}"]`) as HTMLElement | null
    if (!statsWrapper) return
    const statsCtrl = app.getControllerForElementAndIdentifier(statsWrapper, "system-stats") as { setStats(stats: unknown, trades: unknown): void } | null
    statsCtrl?.setStats(stats, trades)
  }

  private _startLinkedDataRefreshIfActive() {
    if (this._linkedDataRefreshInterval) {
      clearInterval(this._linkedDataRefreshInterval)
      this._linkedDataRefreshInterval = null
    }
    const tab = this.store.activeTab
    if (tab && this.store.isLinkedDataTab(tab)) {
      this._linkedDataRefreshInterval = setInterval(() => this.dataActions.loadDataGrid(), LINKED_DATA_REFRESH_MS)
    }
  }

  disconnect() {
    if (this._linkedDataRefreshInterval) {
      clearInterval(this._linkedDataRefreshInterval)
      this._linkedDataRefreshInterval = null
    }
    if (this._boundListeners) {
      this.element.removeEventListener("label:created", this._boundListeners.label)
      this.element.removeEventListener("line:created", this._boundListeners.line)
      this.element.removeEventListener("hline:created", this._boundListeners.hline)
      this.element.removeEventListener("vline:created", this._boundListeners.vline)
      this.element.removeEventListener("tabs:openSymbol", this._boundListeners.open)
      this.element.removeEventListener("datagrid:rowclick", this._boundListeners.rowClick)
      this.element.removeEventListener("datagrid:timerange", this._boundListeners.timeRange)
      this.element.removeEventListener("datagrid:loaded", this._boundListeners.gridLoaded)
      this.element.removeEventListener("tabs:startLinkedDataRefresh", this._boundListeners.startLinkedDataRefresh)
      this.element.removeEventListener("datagrid:columnStateChanged", this._boundListeners.columnStateChanged as EventListener)
      this.element.removeEventListener("datatab:openSystemStats", this._boundListeners.openSystemStats as EventListener)
      this.element.removeEventListener("systemstats:requestStats", this._boundListeners.requestStats as EventListener)
      this._boundListeners = null
    }
  }

  // --- Tab type menu ---

  toggleAddTabMenu(e: Event) {
    e.stopPropagation()
    const dropdown = this.tabBarTarget.querySelector("[data-tab-type-dropdown]")
    if (!dropdown) return
    const isOpen = !dropdown.classList.contains("hidden")
    dropdown.classList.toggle("hidden")
    if (!isOpen) {
      const close = (ev: MouseEvent) => {
        if (!(ev.target as HTMLElement).closest("[data-tab-type-menu]")) {
          dropdown.classList.add("hidden")
          document.removeEventListener("click", close)
        }
      }
      setTimeout(() => document.addEventListener("click", close), 0)
    }
  }

  // --- Tab CRUD ---

  addTab() { this.store.addTab(); this.render() }
  addChartTab() { this.addTab() }
  addDataTab() { this.store.addDataTab(); this.render() }

  createDataFromChart(e: Event) {
    e.stopPropagation()
    const tabEl = (e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null
    if (tabEl?.dataset.tabId) { this.store.addDataTabFromChart(tabEl.dataset.tabId); this.render() }
  }

  removeTab(e: Event) {
    e.stopPropagation()
    const tabId = ((e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null)?.dataset.tabId
    if (tabId && this.store.removeTab(tabId)) this.render()
  }

  switchTab(e: Event) {
    if (this._tabDragJustEnded) {
      this._tabDragJustEnded = false
      return
    }
    const tabId = ((e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null)?.dataset.tabId
    if (!tabId || !this.store.activateTab(tabId)) return
    this.render()

    if (this._linkedDataRefreshInterval) {
      clearInterval(this._linkedDataRefreshInterval)
      this._linkedDataRefreshInterval = null
    }

    const tab = this.store.activeTab
    if (tab && this.store.isLinkedDataTab(tab)) {
      this._linkedDataRefreshInterval = setInterval(() => this.dataActions.loadDataGrid(), LINKED_DATA_REFRESH_MS)
    }
  }

  tabDragHandleClick(e: Event) {
    e.stopPropagation()
  }

  tabDragStart(e: DragEvent) {
    if (!e.dataTransfer) return
    const source = (e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null
    const tabId = source?.dataset.dragTabId || source?.dataset.tabId
    if (tabId) {
      e.dataTransfer.setData("text/plain", tabId)
      e.dataTransfer.effectAllowed = "move"
      const dragImage = source || (e.currentTarget as HTMLElement)
      e.dataTransfer.setDragImage(dragImage, 0, 0)
    }
  }

  tabDragOver(e: DragEvent) {
    if (!e.dataTransfer) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    ;(e.currentTarget as HTMLElement).classList.add("tab-drop-target")
  }

  tabDragLeave(e: DragEvent) {
    ;(e.currentTarget as HTMLElement).classList.remove("tab-drop-target")
  }

  tabDrop(e: DragEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).classList.remove("tab-drop-target")
    const dragTabId = e.dataTransfer?.getData("text/plain")
    const dropEl = e.currentTarget as HTMLElement
    const dropTargetTabId = dropEl.dataset.tabId || dropEl.dataset.dragTabId
    if (!dragTabId || !dropTargetTabId || dragTabId === dropTargetTabId) return
    const tabs = this.store.tabs
    const dragGroup = this.store.getTabGroupForDrag(dragTabId)
    const dropGroup = this.store.getTabGroupForDrag(dropTargetTabId)
    const dragIdx = tabs.findIndex((t) => t.id === dragGroup[0])
    const dropIdx = tabs.findIndex((t) => t.id === dropGroup[0])
    if (dragIdx === -1 || dropIdx === -1) return
    const insertBefore = dropIdx < dragIdx
    if (this.store.reorderTabs(dragTabId, dropTargetTabId, insertBefore)) {
      this._tabDragJustEnded = true
      this.render()
    }
  }

  tabDragEnd(_e: DragEvent) {
    this._tabDragJustEnded = true
    this.tabBarTarget.querySelectorAll(".tab-drop-target").forEach((el) => el.classList.remove("tab-drop-target"))
  }

  startRename(e: Event) {
    e.stopPropagation()
    const labelEl = e.currentTarget as HTMLElement
    const tabBtn = labelEl.closest("[data-tab-id]") as HTMLElement | null
    if (!tabBtn) return
    const tabId = tabBtn.dataset.tabId

    const tab = this.store.tabs.find(t => t.id === tabId)

    const input = document.createElement("input")
    input.type = "text"
    input.value = tab ? this.store.tabBaseName(tab) : (labelEl.textContent || "")
    input.className = "w-36 px-2 py-1 text-base text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"
    const commit = () => {
      const name = input.value.trim()
      if (name && tabId) this.store.renameTab(tabId, name)
      this.render()
    }
    input.addEventListener("blur", commit)
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") input.blur()
      if (ev.key === "Escape") { input.value = labelEl.textContent; input.blur() }
    })
    labelEl.replaceWith(input)
    input.focus()
    input.select()
  }

  // --- Panel actions ---

  addPanel(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (tab) { this.store.addPanel(tab.id); this.render() }
  }

  removePanel(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.closePanel
    if (panelId && this.store.removePanel(panelId)) this.render()
  }

  movePanelUp(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.panelId
    if (panelId && this.store.movePanelUp(panelId)) this.render()
  }

  movePanelDown(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.panelId
    if (panelId && this.store.movePanelDown(panelId)) this.render()
  }

  selectPanel(e: Event) {
    if ((e.target as HTMLElement).closest("[data-close-panel]")) return
    if ((e.target as HTMLElement).closest("[data-move-panel]")) return
    const panelEl = (e.currentTarget as HTMLElement).closest("[data-panel-id]") as HTMLElement | null
    const panelId = panelEl?.dataset.panelId
    if (panelId && this.store.selectPanel(panelId)) this.render()
  }

  // --- Overlay actions ---

  addOverlay(e: Event) {
    e.stopPropagation()
    const panel = this.store.selectedPanel
    if (panel) { this.store.addOverlay(panel.id); this.render() }
  }

  removeOverlay(e: Event) {
    e.stopPropagation()
    const overlayId = (e.currentTarget as HTMLElement).dataset.removeOverlay
    const panel = this.store.selectedPanel
    if (!panel || !overlayId) return
    this._withChartCtrl(c => c.removeOverlay(overlayId))
    if (this.store.removeOverlay(panel.id, overlayId)) this.render()
  }

  selectOverlay(e: Event) {
    if ((e.target as HTMLElement).closest("[data-toggle-overlay-visibility]")) return
    if ((e.target as HTMLElement).closest("[data-remove-overlay]")) return
    const overlayId = (e.currentTarget as HTMLElement).dataset.overlayId
    if (overlayId && this.store.selectOverlay(overlayId)) this.render()
  }

  toggleOverlayVisibility(e: Event) {
    e.stopPropagation()
    const overlayId =
      (e.currentTarget as HTMLElement).dataset.overlayId ||
      ((e.currentTarget as HTMLElement).closest("[data-overlay-id]") as HTMLElement | null)?.dataset.overlayId ||
      this.store.selectedOverlayId
    if (!overlayId) return
    const overlay = this.store.overlayById(overlayId)
    if (!overlay) return
    const visible = overlay.visible === false
    if (!this.store.setOverlayVisible(overlayId, visible)) return
    this._withChartCtrl(c => c.setOverlayVisibility(overlayId, visible))
    this.render()
  }

  // --- Section collapse ---

  _toggleSidebarSection(key: string): void {
    ;(this.renderer.sidebar as unknown as Record<string, unknown>)[key] = !(this.renderer.sidebar as unknown as Record<string, unknown>)[key]
    this.render()
  }

  toggleChartsSection()     { this._toggleSidebarSection("chartsCollapsed") }
  toggleLabelsSection()     { this._toggleSidebarSection("labelsCollapsed") }
  toggleSystemsSection()    { this._toggleSidebarSection("systemsCollapsed") }
  toggleTextSublist()       { this._toggleSidebarSection("textCollapsed") }
  toggleTrendLinesSublist() { this._toggleSidebarSection("trendLinesCollapsed") }
  toggleHLinesSublist()     { this._toggleSidebarSection("hlinesCollapsed") }
  toggleVLinesSublist()     { this._toggleSidebarSection("vlinesCollapsed") }

  // --- Clear all drawings ---

  clearAllLabels() {
    const panel = this.store.selectedPanel
    if (!panel) return
    this.store.clearAllDrawings(panel.id)
    this._withChartCtrl(c => { c.setLabels([]); c.setLines([]); c.setHLines([]); c.setVLines([]) })
    this.render()
  }

  clearAllText() { this.drawingActions.clearAll("labels") }
  clearAllLines() { this.drawingActions.clearAll("lines") }
  clearAllHLines() { this.drawingActions.clearAll("hlines") }
  clearAllVLines() { this.drawingActions.clearAll("vlines") }

  // --- Drawing mode toggles ---

  toggleLabelMode() { this.drawingActions.toggleMode("labels") }
  toggleLineMode() { this.drawingActions.toggleMode("lines") }
  toggleHLineMode() { this.drawingActions.toggleMode("hlines") }
  toggleVLineMode() { this.drawingActions.toggleMode("vlines") }

  // --- Drawing item actions ---

  _drawingParams(e: Event): { kind: DrawingKind; id: string } {
    const el = e.currentTarget as HTMLElement
    return { kind: (el.dataset.drawingKind ?? "") as DrawingKind, id: el.dataset.drawingId ?? "" }
  }

  removeDrawing(e: Event) { e.stopPropagation(); const { kind, id } = this._drawingParams(e); this.drawingActions.removeItem(kind, id) }
  selectDrawing(e: Event) {
    if ((e.target as HTMLElement).closest("input[type='color']") || (e.target as HTMLElement).closest("select") || (e.target as HTMLElement).closest("[data-action*='removeDrawing']")) return
    const { kind, id } = this._drawingParams(e); this.drawingActions.selectItem(kind, id)
  }
  startDrawingRename(e: Event) {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest("input[type='color']") || (e.target as HTMLElement).closest("select")) return
    const { kind, id } = this._drawingParams(e); this.drawingActions.startRename(kind, id, e.currentTarget as HTMLElement)
  }
  changeDrawingColor(e: Event) { e.stopPropagation(); const { kind, id } = this._drawingParams(e); this.drawingActions.changeColor(kind, id, (e.currentTarget as HTMLInputElement).value) }
  changeDrawingWidth(e: Event) { e.stopPropagation(); const { kind, id } = this._drawingParams(e); this.drawingActions.changeWidth(kind, id, parseInt((e.currentTarget as HTMLInputElement).value, 10)) }
  changeDrawingFontSize(e: Event) { e.stopPropagation(); const { kind, id } = this._drawingParams(e); this.drawingActions.changeFontSize(kind, id, parseInt((e.currentTarget as HTMLInputElement).value, 10)) }

  // --- Drawing created events ---

  _onDrawingCreated(kind: string, e: Event, nameFn?: (d: Record<string, unknown>) => string): void {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = { ...(e as CustomEvent).detail }
    if (panel.timeframe) detail.timeframe = panel.timeframe
    if (nameFn) {
      const existing = (panel[kind] as DrawingItem[]) || []
      detail.name = `${nameFn(detail)}${existing.length + 1}`
    }
    this.drawingActions.onCreated(kind as DrawingKind, panel, detail)
  }

  _onLineCreated(e: Event): void {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = (e as CustomEvent).detail
    const existingLines = panel.lines || []
    const symbolLines = existingLines.filter(l => l.symbol === detail.symbol)
    const name = `${detail.symbol || "Line"} line${symbolLines.length + 1}`
    this.drawingActions.onCreated("lines" as DrawingKind, panel, { ...detail, name, timeframe: panel.timeframe })
  }

  _onOpenSymbol(e: Event): void {
    const symbol = (e as CustomEvent).detail?.symbol
    if (symbol) { this.store.addTab({ symbol }); this.render() }
  }

  // --- Chart sidebar delegations ---

  applySettings()                    { this.chartActions.applySettings() }
  applySettingsOnEnter(e: KeyboardEvent) { this.chartActions.applySettingsOnEnter(e) }
  setMode(e: Event)                  { this.chartActions.setMode(e) }
  switchChartType(e: Event)          { this.chartActions.switchChartType(e) }
  changePinnedTo(e: Event)           { this.chartActions.changePinnedTo(e) }
  cycleIndicatorFilter()             { this.chartActions.cycleIndicatorFilter() }
  switchIndicatorType(e: Event)      { this.chartActions.switchIndicatorType(e) }
  applyIndicatorOnEnter(e: KeyboardEvent) { this.chartActions.applyIndicatorOnEnter(e) }
  applyIndicator()                   { this.chartActions.applyIndicator() }
  switchColorScheme(e: Event)        { this.chartActions.switchColorScheme(e) }
  adjustOverlayOpacity(e: Event)     { this.chartActions.adjustOverlayOpacity(e) }
  toggleCustomInput(e: Event)        { this.chartActions.toggleCustomInput(e) }
  toggleVolumeProfile()              { this.chartActions.toggleVolumeProfile() }
  adjustVpOpacity(e: Event)          { this.chartActions.adjustVpOpacity(e) }

  // --- Data tab delegations ---

  updateDataSymbol(e: Event)         { this.dataActions.updateDataSymbol(e) }
  updateDataTimeframe(e: Event)      { this.dataActions.updateDataTimeframe(e) }
  updateDataDateRange()              { this.dataActions.updateDataDateRange() }
  setDataDateRangeAndLoad()          { this.dataActions.setDataDateRangeAndLoad() }
  toggleDataColumns()                { this.dataActions.toggleDataColumns() }
  toggleDataConditions()             { this.dataActions.toggleDataConditions() }
  showAddColumn()                    { this.dataActions.showAddColumn() }
  hideAddColumn()                    { this.dataActions.hideAddColumn() }
  onNewColumnTypeChange(e: Event)    { this.dataActions.onNewColumnTypeChange(e) }
  addColumn()                        { this.dataActions.addColumn() }
  removeColumn(e: Event)             { this.dataActions.removeColumn(e) }
  toggleColumnVisibility(e: Event)   { this.dataActions.toggleColumnVisibility(e) }
  editFormulaColumn(e: Event)        { this.dataActions.editFormulaColumn(e) }
  saveFormulaColumn(e: Event)        { this.dataActions.saveFormulaColumn(e) }
  cancelFormulaEdit()                { this.dataActions.cancelFormulaEdit() }
  toggleCondition(e: Event)          { this.dataActions.toggleCondition(e) }
  removeConditionBtn(e: Event)       { this.dataActions.removeConditionBtn(e) }
  showAddCondition()                 { this.dataActions.showAddCondition() }
  confirmAddCondition()              { this.dataActions.confirmAddCondition() }
  cancelAddCondition()               { this.dataActions.cancelAddCondition() }
  editCondition(e: Event)            { this.dataActions.editCondition(e) }
  confirmEditCondition()             { this.dataActions.confirmEditCondition() }
  onCondOperatorChange(e: Event)     { this.dataActions.onCondOperatorChange(e) }
  onCondActionTypeChange(e: Event)   { this.dataActions.onCondActionTypeChange(e) }
  toggleDataSystems()                { this.dataActions.toggleDataSystems() }
  addSystem()                        { this.dataActions.addSystem() }
  cancelSystem()                     { this.dataActions.cancelSystem() }
  confirmAddSystem()                 { this.dataActions.confirmAddSystem() }
  editSystem(e: Event)               { this.dataActions.editSystem(e) }
  confirmEditSystem()                { this.dataActions.confirmEditSystem() }
  toggleSystem(e: Event)             { this.dataActions.toggleSystem(e) }
  toggleSystemOnChart(e: Event)      { this.dataActions.toggleSystemOnChart(e) }
  removeSystem(e: Event)             { this.dataActions.removeSystem(e) }
  openSystemStats(e: Event)          { this.dataActions.openSystemStats(e) }
  onSystemRuleOperatorChange(e: Event)  { this.dataActions.onSystemRuleOperatorChange(e) }
  onSystemDirectionToggle(e: Event)     { this.dataActions.onSystemDirectionToggle(e) }
  showAddChartLink()                 { this.dataActions.showAddChartLink() }
  confirmAddChartLink()              { this.dataActions.confirmAddChartLink() }
  cancelAddChartLink()               { this.dataActions.cancelAddChartLink() }
  removeChartLink(e: Event)          { this.dataActions.removeChartLink(e) }
  loadDataGrid()                     { return this.dataActions.loadDataGrid() }
  exportCsv()                        { this.dataActions.exportCsv() }

  // --- Panel resize ---

  startResize(e: Event) { startPanelResize(e as MouseEvent, "tabs") }

  // --- Render ---

  render(): void {
    this.dataActions.syncIndicatorsFromChart()
    const panel = this.store.selectedPanel
    const vp = panel?.volumeProfile ?? { enabled: false, opacity: 0.3 }
    const chartTabOptions = this.store.tabs
      .filter(t => t.type === "chart")
      .map(t => ({ id: t.id, label: this.store.tabLabel(t), primarySymbol: this.store.primaryPanel(t)?.overlays[0]?.symbol ?? null }))
    this.renderer.render({
      tabs: this.store.tabs,
      activeTabId: this.store.activeTabId,
      selectedPanelId: this.store.selectedPanelId,
      selectedOverlayId: this.store.selectedOverlayId,
      symbols: this.config.symbols,
      timeframes: this.config.timeframes,
      labelFn: (tab) => this.store.tabLabel(tab),
      indicators: this.config.indicators,
      labelModeActive: this.drawingActions.modes.labels,
      lineModeActive: this.drawingActions.modes.lines,
      vpEnabled: !!vp.enabled,
      vpOpacity: vp.opacity ?? 0.3,
      hlModeActive: this.drawingActions.modes.hlines,
      vlModeActive: this.drawingActions.modes.vlines,
      chartTabOptions,
    })
    requestAnimationFrame(() => {
      this._syncSelectedOverlayScale()
      this.drawingActions.syncAllModesToChart(this._getSelectedChartCtrl())
      this._refreshChartLabelsIfNeeded()
    })
  }

  // --- Private helpers ---

  private _refreshChartLabelsIfNeeded(): void {
    const activeTab = this.store.activeTab
    if (!activeTab || activeTab.type !== "chart") return
    this.dataActions.syncAllDataConditionsToChart(activeTab.id)
  }

  _panelFromEvent(e: Event): Panel | null {
    const panelEl = (e.target as HTMLElement).closest("[data-panel-id]") as HTMLElement | null
    if (!panelEl) return this.store.selectedPanel
    return this._panelById(panelEl.dataset.panelId ?? "") || this.store.selectedPanel
  }

  _getSelectedChartCtrl() {
    const panel = this.store.selectedPanel
    return panel ? this._chartCtrlForPanel(panel.id) : null
  }

  _withChartCtrl(fn: (ctrl: ChartControllerAPI) => void): void {
    const ctrl = this._getSelectedChartCtrl()
    if (ctrl) fn(ctrl)
  }

  _chartCtrlForPanel(panelId: string): ChartControllerAPI | null {
    const panelEl = this.panelsTarget.querySelector(`[data-panel-id="${panelId}"]`)
    const chartEl = panelEl?.querySelector("[data-controller='chart']")
    if (!chartEl) return null
    return this.application.getControllerForElementAndIdentifier(chartEl, "chart") as ChartControllerAPI | null
  }

  _syncSelectedOverlayScale() {
    const selectedPanelId = this.store.selectedPanelId
    const selectedOverlayId = this.store.selectedOverlayId

    this.panelsTarget.querySelectorAll("[data-panel-id]").forEach((panelEl: Element) => {
      const chartEl = panelEl.querySelector("[data-controller='chart']")
      if (!chartEl) return
      const chartCtrl = this.application.getControllerForElementAndIdentifier(chartEl, "chart") as ChartControllerAPI | null
      if (!chartCtrl?.setSelectedOverlayScale) return

      const panel = this._panelById((panelEl as HTMLElement).dataset.panelId ?? "")
      if (panel) {
        this._syncOverlaysToChart(chartCtrl, panel)
        this._syncDrawingsToChart(chartCtrl, panel)
        this._syncVpToChart(chartCtrl, panel)
      }

      const isSelected = (panelEl as HTMLElement).dataset.panelId === selectedPanelId
      chartCtrl.setSelectedOverlayScale(isSelected ? selectedOverlayId : null)
    })
  }

  _syncOverlaysToChart(chartCtrl: ChartControllerAPI, panel: Panel): void {
    if (!chartCtrl.setOverlayVisibility) return
    panel.overlays.forEach(overlay => {
      chartCtrl.showMode(overlay.id, overlay.mode || "price")
      if (overlay.mode === "indicator" && !chartCtrl.hasIndicatorSeries(overlay.id)) {
        chartCtrl.updateIndicator(overlay.id, overlay.indicatorType || "", overlay.indicatorParams as Record<string, number> || {}, overlay.pinnedTo, overlay.indicatorSource || "")
      }
      chartCtrl.setOverlayVisibility(overlay.id, overlay.visible !== false)
      if (chartCtrl.setOverlayColorScheme) chartCtrl.setOverlayColorScheme(overlay.id, overlay.colorScheme)
      if (chartCtrl.setOverlayOpacity) chartCtrl.setOverlayOpacity(overlay.id, overlay.opacity)
    })
  }

  _syncDrawingsToChart(chartCtrl: ChartControllerAPI, panel: Panel): void {
    chartCtrl.setLabels((panel.labels || []) as unknown as LabelMarkerInput[])
    chartCtrl.setLines(panel.lines || [])
    chartCtrl.setHLines(panel.hlines || [])
    chartCtrl.setVLines(panel.vlines || [])
  }

  _syncVpToChart(chartCtrl: ChartControllerAPI, panel: Panel): void {
    const volumeProfile = panel.volumeProfile ?? { enabled: false, opacity: 0.3 }
    if (volumeProfile.enabled && !chartCtrl.vpEnabled) {
      chartCtrl.enableVolumeProfile(volumeProfile.opacity ?? 0.3)
    } else if (!volumeProfile.enabled && chartCtrl.vpEnabled) {
      chartCtrl.disableVolumeProfile()
    }
  }

  _panelById(panelId: string): Panel | null {
    for (const tab of this.store.tabs) {
      const panel = tab.panels.find(p => p.id === panelId)
      if (panel) return panel
    }
    return null
  }
}
