import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"
import { fetchResearchCatalog } from "../research/dsl"
import { startPanelResize } from "../tabs/panel_resizer"
import DrawingActions from "../tabs/drawing_actions"
import DataTabActions from "../tabs/data_actions"
import ChartSidebarActions from "../tabs/chart_sidebar_actions"
import ChartBridge from "../data_grid/chart_bridge"
import type { Panel, DrawingKind, DrawingItem, ChartControllerAPI, LabelMarkerInput, StimulusApp, IndicatorInfo } from "../types/store"
import ResearchCoordinator from "../workspace/research_coordinator"
import SystemEditorCoordinator from "../workspace/system_editor_coordinator"
import AssistantCoordinator from "../workspace/assistant_coordinator"
import LinkedDataCoordinator from "../workspace/linked_data_coordinator"
import WorkspaceEvents from "../workspace/events"
import { showToast } from "../services/toast"

const TAB_SCROLL_THRESHOLD_PX = 4

type SidebarCollapseKey =
  | "chartsCollapsed"
  | "labelsCollapsed"
  | "systemsCollapsed"
  | "textCollapsed"
  | "trendLinesCollapsed"
  | "hlinesCollapsed"
  | "vlinesCollapsed"

interface WorkspaceCoordinators {
  research: ResearchCoordinator
  systemEditor: SystemEditorCoordinator
  assistant: AssistantCoordinator
  linkedData: LinkedDataCoordinator
}

export default class extends Controller {
  static targets = ["tabBar", "panels", "sidebar", "mainPanel", "panelsRow"]

  declare tabBarTarget: HTMLElement
  declare panelsTarget: HTMLElement
  declare sidebarTarget: HTMLElement
  declare mainPanelTarget: HTMLElement
  declare hasMainPanelTarget: boolean
  declare panelsRowTarget: HTMLElement
  declare hasPanelsRowTarget: boolean

  store!: TabStore
  config!: { symbols: string[]; timeframes: string[]; indicators: IndicatorInfo[] }
  renderer!: TabRenderer
  drawingActions!: DrawingActions
  chartBridge!: ChartBridge
  dataActions!: DataTabActions
  chartActions!: ChartSidebarActions
  private research: ResearchCoordinator | null = null
  private systemEditor: SystemEditorCoordinator | null = null
  private assistant: AssistantCoordinator | null = null
  private linkedData: LinkedDataCoordinator | null = null
  private workspaceEvents: WorkspaceEvents | null = null
  private _tabDragJustEnded = false
  private _boundOpenChart: ((e: Event) => void) | null = null
  private _tabScrollArea: HTMLElement | null = null
  private _lastRenderedActiveTabId: string | null = null
  private _lastRenderedTabCount = 0
  private _tabBarScrollLeft = 0
  private _forceRevealActiveTab = false
  private _connectVersion = 0
  private readonly _onTabBarScroll = () => {
    this._tabBarScrollLeft = this._tabScrollArea?.scrollLeft ?? 0
    this._syncTabBarScrollControls()
  }
  private readonly _onTabBarWheel = (event: WheelEvent) => {
    const area = this._tabScrollArea
    if (!area) return

    const maxScrollLeft = Math.max(0, area.scrollWidth - area.clientWidth)
    if (maxScrollLeft <= 0) return

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return

    event.preventDefault()
    area.scrollLeft += delta
    this._tabBarScrollLeft = area.scrollLeft
    this._syncTabBarScrollControls()
  }
  private readonly _onWindowResize = () => this._syncTabBarScrollControls()
  private readonly _revealActiveTab = () => {
    this._forceRevealActiveTab = true
  }

  async connect() {
    const connectVersion = ++this._connectVersion
    this.store = new TabStore()
    const initialActiveTabId = this.store.activeTabId
    if (initialActiveTabId && this.store.tabs.some(tab => tab.id === initialActiveTabId)) {
      this.store.activateTab(initialActiveTabId)
    }
    const [config, researchCatalog] = await Promise.all([
      fetchConfig(),
      fetchResearchCatalog(),
    ])
    if (connectVersion !== this._connectVersion) return

    this.config = config
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
    this.research = new ResearchCoordinator({
      store: this.store,
      config: this.config,
      sidebarTarget: this.sidebarTarget,
      panelsTarget: this.panelsTarget,
      application: this.application as StimulusApp,
      renderFn: () => this.render(),
      revealActiveTab: this._revealActiveTab,
    })
    this.research.setCatalogSnapshot(researchCatalog)

    const getSystemEditorDiagnostics = (tabId: string) => this.systemEditor?.diagnosticsFor(tabId) || []
    const clearSystemEditorDiagnostics = (tabId: string) => { this.systemEditor?.clearDiagnostics(tabId) }

    this.assistant = new AssistantCoordinator({
      store: this.store,
      renderFn: () => this.render(),
      revealActiveTab: this._revealActiveTab,
      getSystemEditorDiagnostics,
      clearSystemEditorDiagnostics,
    })
    this.systemEditor = new SystemEditorCoordinator({
      store: this.store,
      config: this.config,
      research: this.research,
      assistant: this.assistant,
      renderFn: () => this.render(),
      revealActiveTab: this._revealActiveTab,
    })
    this.assistant.reconcileLinkedTarget()
    this.linkedData = new LinkedDataCoordinator({
      store: this.store,
      dataActions: this.dataActions,
      panelsTarget: this.panelsTarget,
      application: this.application as StimulusApp,
      renderFn: () => this.render(),
    })
    this.workspaceEvents = new WorkspaceEvents(this.element, {
      onLabelCreated: (e) => this._onDrawingCreated("labels", e),
      onLineCreated: (e) => this._onLineCreated(e),
      onHLineCreated: (e) => this._onDrawingCreated("hlines", e, (d) => `${d.symbol || "HL"} HL`),
      onVLineCreated: (e) => this._onDrawingCreated("vlines", e, (d) => `${d.symbol || "VL"} VL`),
      onOpenSymbol: (e) => this._onOpenSymbol(e),
      onDataGridRowClick: (e) => this.dataActions.onDataGridRowClick(e),
      onDataGridTimeRange: (e) => this.dataActions.onDataGridTimeRange(e),
      onDataGridLoaded: (_e) => this.dataActions.onDataGridLoaded(),
      onStartLinkedDataRefresh: (_e) => this.linkedData?.startRefreshIfActive(),
      onDataGridColumnStateChanged: (e) => this.linkedData?.onColumnStateChanged(e),
      onOpenSystemStats: (e) => this.linkedData?.onOpenSystemStats(e),
      onSystemStatsRequest: (e) => this.linkedData?.onSystemStatsRequest(e),
      onResearchConfigChanged: (e) => this.research?.onConfigChanged(e),
      onResearchResultChanged: (e) => this.research?.onResultChanged(e),
      onSystemEditorConfigChanged: (e) => this.systemEditor?.onConfigChanged(e),
      onSystemEditorCatalogChanged: (e) => { void this.systemEditor?.onCatalogChanged(e) },
      onSystemEditorOpenResearch: (e) => this.systemEditor?.onOpenResearch(e),
      onSystemEditorOpenAssistant: (e) => this.systemEditor?.onOpenAssistant(e),
      onSystemEditorLinkAssistantTarget: (e) => this.systemEditor?.onLinkAssistantTarget(e),
      onAssistantStateChanged: (e) => this.assistant?.onStateChanged(e),
      onAssistantOpenDraftInSystemEditor: (e) => this.assistant?.openDraftInSystemEditor(e),
      onAssistantApplyDraftToLinkedEditor: (e) => this.assistant?.applyDraftToLinkedEditor(e),
    })
    this.workspaceEvents.connect()
    if (this.config.indicators?.length) {
      this.renderer.dataSidebar.availableIndicators = this.config.indicators as IndicatorInfo[]
    }
    window.addEventListener("resize", this._onWindowResize)
    window.addEventListener("nav:openChart", this._boundOpenChart = (e: Event) => {
      const symbol = (e as CustomEvent).detail?.symbol
      if (symbol) {
        this.store.addTab({ symbol })
        this._forceRevealActiveTab = true
        this._updateMainPanelVisibility()
        this.render()
      }
    })
    this._updateMainPanelVisibility()
    this.render()
  }

  disconnect() {
    this._connectVersion++
    window.removeEventListener("resize", this._onWindowResize)
    if (this._boundOpenChart) window.removeEventListener("nav:openChart", this._boundOpenChart)
    this._unbindTabBarScrollArea()
    this.workspaceEvents?.disconnect()
    this.workspaceEvents = null
    this.research?.disconnect()
    this.systemEditor?.disconnect()
    this.assistant?.disconnect()
    this.linkedData?.disconnect()
    this.research = null
    this.systemEditor = null
    this.assistant = null
    this.linkedData = null
  }

  // --- Tab CRUD ---

  addTab() {
    if (!this.workspaceReady()) {
      this.notifyWorkspaceNotReady()
      return
    }
    this.store.addTab()
    this._forceRevealActiveTab = true
    this.render()
  }
  addAssistantTab() {
    const coordinators = this.workspaceCoordinators()
    if (!coordinators) {
      this.notifyWorkspaceNotReady()
      return
    }
    coordinators.assistant.addAssistantTab()
  }
  addChartTab() { this.addTab() }
  addDataTab() {
    if (!this.workspaceReady()) {
      this.notifyWorkspaceNotReady()
      return
    }
    this.store.addDataTab()
    this._forceRevealActiveTab = true
    this.render()
  }
  addResearchTab() {
    const coordinators = this.workspaceCoordinators()
    if (!coordinators) {
      this.notifyWorkspaceNotReady()
      return
    }
    coordinators.research.addResearchTab()
  }
  addSystemEditorTab() {
    const coordinators = this.workspaceCoordinators()
    if (!coordinators) {
      this.notifyWorkspaceNotReady()
      return
    }
    coordinators.systemEditor.addSystemEditorTab()
  }

  createDataFromChart(e: Event) {
    e.stopPropagation()
    const tabEl = (e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null
    const tabId = tabEl?.dataset.tabId
    if (!tabId) return

    this.store.addDataTabFromChart(tabId)
    this.render()
  }

  removeTab(e: Event) {
    e.stopPropagation()
    const tabId = ((e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null)?.dataset.tabId
    if (!tabId) return

    const removedTab = this.store.tabs.find(tab => tab.id === tabId) || null
    if (!this.store.removeTab(tabId)) return

    if (removedTab?.type === "system_editor") {
      this.systemEditor?.onTabRemoved(tabId)
    } else if (removedTab?.type === "research") {
      this.research?.onTabRemoved(tabId)
    }

    // These coordinators track cross-tab state, so every removal may matter.
    this.linkedData?.onTabRemoved(tabId)
    this.assistant?.onTabRemoved(tabId)
    this._updateMainPanelVisibility()
    this.render()
  }

  switchTab(e: Event) {
    if (this._tabDragJustEnded) {
      this._tabDragJustEnded = false
      return
    }
    const tabId = ((e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null)?.dataset.tabId
    if (!tabId || !this.store.activateTab(tabId)) return
    this.render()
    this.linkedData?.onActiveTabChanged()
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

  togglePanelExpand(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.togglePanelExpand
    if (panelId && this.store.togglePanelMaximize(panelId)) this.render()
  }

  selectPanel(e: Event) {
    if ((e.target as HTMLElement).closest("[data-close-panel]")) return
    if ((e.target as HTMLElement).closest("[data-move-panel]")) return
    if ((e.target as HTMLElement).closest("[data-toggle-panel-expand]")) return
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

  _toggleSidebarSection(key: SidebarCollapseKey): void {
    this.renderer.sidebar[key] = !this.renderer.sidebar[key]
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

  clearAllDrawings() {
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

  removeDrawing(e: Event) {
    e.stopPropagation()
    const { kind: drawingKind, id: drawingId } = this._drawingParams(e)
    this.drawingActions.removeItem(drawingKind, drawingId)
  }
  selectDrawing(e: Event) {
    if ((e.target as HTMLElement).closest("input[type='color']") || (e.target as HTMLElement).closest("select") || (e.target as HTMLElement).closest("[data-action*='removeDrawing']")) return
    const { kind: drawingKind, id: drawingId } = this._drawingParams(e); this.drawingActions.selectItem(drawingKind, drawingId)
  }
  startDrawingRename(e: Event) {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest("input[type='color']") || (e.target as HTMLElement).closest("select")) return
    const { kind: drawingKind, id: drawingId } = this._drawingParams(e); this.drawingActions.startRename(drawingKind, drawingId, e.currentTarget as HTMLElement)
  }
  changeDrawingColor(e: Event) { e.stopPropagation(); const { kind: drawingKind, id: drawingId } = this._drawingParams(e); this.drawingActions.changeColor(drawingKind, drawingId, (e.currentTarget as HTMLInputElement).value) }
  changeDrawingWidth(e: Event) { e.stopPropagation(); const { kind: drawingKind, id: drawingId } = this._drawingParams(e); this.drawingActions.changeWidth(drawingKind, drawingId, parseInt((e.currentTarget as HTMLInputElement).value, 10)) }
  changeDrawingFontSize(e: Event) { e.stopPropagation(); const { kind: drawingKind, id: drawingId } = this._drawingParams(e); this.drawingActions.changeFontSize(drawingKind, drawingId, parseInt((e.currentTarget as HTMLInputElement).value, 10)) }

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
  setDataDateRangeAndLoad(e?: Event) { this.dataActions.setDataDateRangeAndLoad(e) }
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

  // --- Research tab ---

  updateResearchConfig(e?: Event) {
    if (!this.research?.updateActiveConfigFromSidebar(e)) return
    this.render()
  }

  async runResearch() {
    await this.research?.runActive()
  }

  openResearchFilePicker() {
    this.research?.openFilePicker()
  }

  closeResearchFilePicker() {
    this.research?.closeFilePicker()
  }

  updateResearchFilePickerQuery(e: Event) {
    this.research?.updateFilePickerQuery(e)
  }

  selectResearchFileManagerEntry(e: Event) {
    this.research?.selectFileManagerEntry(e)
  }

  navigateResearchFileManager(e: Event) {
    this.research?.navigateFileManager(e)
  }

  openResearchFileManagerEntry(e: Event) {
    this.research?.openFileManagerEntry(e)
  }

  confirmResearchFileSelection() {
    this.research?.confirmFileSelection()
  }

  async createResearchDirectory() {
    await this.research?.createDirectory()
  }

  async renameResearchEntry() {
    await this.research?.renameEntry()
  }

  async deleteResearchEntry() {
    await this.research?.deleteEntry()
  }

  stopFileManagerPropagation(e: Event) {
    e.stopPropagation()
  }


  openResearchSystemEditor() {
    this.systemEditor?.openFromActiveResearch()
  }

  // --- Panel resize ---

  startResize(e: Event) { startPanelResize(e as MouseEvent, "tabs") }

  scrollTabsLeft() {
    this._scrollTabsBy(-1)
  }

  scrollTabsRight() {
    this._scrollTabsBy(1)
  }

  // --- Render ---

  render(): void {
    const coordinators = this.workspaceCoordinators()
    if (!coordinators) return

    const { research, assistant } = coordinators
    this.dataActions.syncIndicatorsFromChart()
    const prevScrollLeft = this._tabScrollArea?.scrollLeft ?? this._tabBarScrollLeft
    const shouldRevealActiveTab = this._forceRevealActiveTab
    const researchValidationSystem = research.prepareActiveRender()

    const panel = this.store.selectedPanel
    const vp = panel?.volumeProfile ?? { enabled: false, opacity: 0.3 }
    const chartTabOptions = this.store.tabs
      .filter(t => t.type === "chart")
      .map(t => ({
        id: t.id,
        label: this.store.tabLabel(t),
        primarySymbol: this.store.primaryPanel(t)?.overlays[0]?.symbol ?? null,
      }))
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
      researchCatalog: research.getCatalog(),
      researchDirectories: research.getDirectories(),
      researchFilePickerOpen: research.filePickerOpen(),
      researchFilePickerQuery: research.filePickerQuery(),
      researchFilePickerDirectoryPath: research.filePickerDirectoryPath(),
      researchFilePickerSelectedPath: research.filePickerSelectedPath(),
      researchValidationSystem,
      assistantStateJson: assistant.stateJson(),
      assistantWorkspaceSnapshotJson: assistant.workspaceSnapshotJson(),
      assistantLinkedTargetContextJson: assistant.linkedTargetContextJson(),
    })
    this._bindTabBarScrollArea()
    if (this._tabScrollArea) {
      const maxScrollLeft = Math.max(0, this._tabScrollArea.scrollWidth - this._tabScrollArea.clientWidth)
      this._tabScrollArea.scrollLeft = Math.min(prevScrollLeft, maxScrollLeft)
    }
    if (shouldRevealActiveTab) {
      this._ensureActiveTabVisible()
    }
    this._tabBarScrollLeft = this._tabScrollArea?.scrollLeft ?? prevScrollLeft
    this._lastRenderedActiveTabId = this.store.activeTabId
    this._lastRenderedTabCount = this.store.tabs.length
    this._forceRevealActiveTab = false
    this._updateMainPanelVisibility()
    this._syncTabBarScrollControls()
    requestAnimationFrame(() => {
      this._syncSelectedOverlayScale()
      this.drawingActions.syncAllModesToChart(this._getSelectedChartCtrl())
      this._refreshChartLabelsIfNeeded()
    })
  }

  // --- Private helpers ---

  private notifyWorkspaceNotReady(): void {
    showToast("Workspace is still loading", "info")
  }

  private workspaceReady(): boolean {
    return this.workspaceCoordinators() !== null
  }

  private workspaceCoordinators(): WorkspaceCoordinators | null {
    const { research, systemEditor, assistant, linkedData } = this
    if (!research || !systemEditor || !assistant || !linkedData) return null
    return { research, systemEditor, assistant, linkedData }
  }

  private _updateMainPanelVisibility(): void {
    if (!this.hasMainPanelTarget) return
    const isEmpty = this.store.tabs.length === 0
    this.mainPanelTarget.classList.toggle("hidden", !isEmpty)
    if (this.hasPanelsRowTarget) this.panelsRowTarget.classList.toggle("hidden", isEmpty)
  }

  private _refreshChartLabelsIfNeeded(): void {
    const activeTab = this.store.activeTab
    if (!activeTab || activeTab.type !== "chart") return
    this.dataActions.syncAllDataConditionsToChart(activeTab.id)
  }

  private _bindTabBarScrollArea(): void {
    const nextArea = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-scroll-area]")
    if (this._tabScrollArea === nextArea) return
    this._unbindTabBarScrollArea()
    this._tabScrollArea = nextArea
    this._tabScrollArea?.addEventListener("scroll", this._onTabBarScroll, { passive: true })
    this._tabScrollArea?.addEventListener("wheel", this._onTabBarWheel, { passive: false })
  }

  private _unbindTabBarScrollArea(): void {
    this._tabScrollArea?.removeEventListener("scroll", this._onTabBarScroll)
    this._tabScrollArea?.removeEventListener("wheel", this._onTabBarWheel)
    this._tabScrollArea = null
  }

  private _scrollTabsBy(direction: 1 | -1): void {
    const area = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-scroll-area]")
    if (!area) return
    const distance = Math.max(180, Math.round(area.clientWidth * 0.7))
    area.scrollBy({ left: direction * distance, behavior: "smooth" })
  }

  private _ensureActiveTabVisible(behavior: ScrollBehavior = "auto"): void {
    const area = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-scroll-area]")
    const activeTab = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-id].text-white")
    if (!area || !activeTab) return
    const maxScrollLeft = Math.max(0, area.scrollWidth - area.clientWidth)
    const areaRect = area.getBoundingClientRect()
    const tabRect = activeTab.getBoundingClientRect()
    const tabLeft = area.scrollLeft + (tabRect.left - areaRect.left)
    const tabRight = tabLeft + activeTab.offsetWidth
    const viewportLeft = area.scrollLeft
    const viewportRight = viewportLeft + area.clientWidth

    if (tabLeft < viewportLeft) {
      area.scrollTo({ left: Math.max(0, tabLeft - 16), behavior })
      return
    }

    if (tabRight > viewportRight) {
      area.scrollTo({ left: Math.min(maxScrollLeft, tabRight - area.clientWidth + 16), behavior })
    }
  }

  private _syncTabBarScrollControls(): void {
    const area = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-scroll-area]")
    const leftBtn = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-scroll-left]")
    const rightBtn = this.tabBarTarget.querySelector<HTMLElement>("[data-tab-scroll-right]")
    if (!area || !leftBtn || !rightBtn) return

    const maxScrollLeft = Math.max(0, area.scrollWidth - area.clientWidth)
    const overflowed = maxScrollLeft > TAB_SCROLL_THRESHOLD_PX
    const canScrollLeft = overflowed && area.scrollLeft > TAB_SCROLL_THRESHOLD_PX
    const canScrollRight = overflowed && area.scrollLeft < maxScrollLeft - TAB_SCROLL_THRESHOLD_PX

    this._setTabScrollButtonState(leftBtn, canScrollLeft)
    this._setTabScrollButtonState(rightBtn, canScrollRight)
  }

  private _setTabScrollButtonState(button: HTMLElement, enabled: boolean): void {
    button.classList.toggle("opacity-35", !enabled)
    button.classList.toggle("pointer-events-none", !enabled)
    button.classList.toggle("cursor-default", !enabled)
    button.setAttribute("aria-hidden", enabled ? "false" : "true")
    if (button instanceof HTMLButtonElement) button.disabled = !enabled
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
