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
import type { Panel, DrawingKind, DrawingItem, ChartControllerAPI, LabelMarkerInput, DataGridControllerAPI, StimulusApp, ResearchConfig, ResearchResult } from "../types/store"
import { LINKED_DATA_REFRESH_MS, SYSTEM_STATS_RETRY_DELAY_MS, SYSTEM_STATS_MAX_RETRIES } from "../config/constants"
import { buildDefaultResearchState, syncResearchStateFromInputs } from "../research/state"
import {
  fetchResearchCatalog,
  validateResearchSystem,
  type ResearchCatalogEntry,
  type ResearchDslDiagnostic,
  type ResearchValidationResponse,
  type ResearchValidatedSystem,
} from "../research/dsl"
import {
  relativeDirname,
} from "../research/file_manager"
import { ResearchFilePicker } from "../research/research_file_picker"
import { showToast } from "../services/toast"
import { loadWorkspaceAssistantState, saveWorkspaceAssistantState } from "../tabs/persistence"
import { hydrateWorkspaceAssistantState } from "../assistant/state"
import { hashText } from "../utils/text_hash"
import type { AssistantTarget, AssistantWorkspaceSnapshot, WorkspaceAssistantState } from "../types/store"

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
  private _boundListeners: Record<string, (e: Event) => void> | null = null
  private _linkedDataRefreshInterval: ReturnType<typeof setInterval> | null = null
  private _tabDragJustEnded = false
  private _researchCatalog: ResearchCatalogEntry[] = []
  private _researchDirectories: string[] = []
  private _researchFilePicker!: ResearchFilePicker
  private _researchValidation = new Map<string, { key: string; result: ResearchValidationResponse | null }>()
  private _researchValidationPending = new Map<string, string>()
  private _systemEditorDiagnostics = new Map<string, ResearchDslDiagnostic[]>()
  private _assistantState: WorkspaceAssistantState = hydrateWorkspaceAssistantState(loadWorkspaceAssistantState())
  private _boundOpenChart: ((e: Event) => void) | null = null
  private _tabScrollArea: HTMLElement | null = null
  private _lastRenderedActiveTabId: string | null = null
  private _lastRenderedTabCount = 0
  private _tabBarScrollLeft = 0
  private _forceRevealActiveTab = false
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

  async connect() {
    this.store = new TabStore()
    const initialActiveTabId = this.store.activeTabId
    if (initialActiveTabId && this.store.tabs.some(tab => tab.id === initialActiveTabId)) {
      this.store.activateTab(initialActiveTabId)
    }
    this._reconcileAssistantLinkedTarget()
    const [ config, researchCatalog ] = await Promise.all([
      fetchConfig(),
      fetchResearchCatalog(),
    ])
    this.config = config
    this._researchCatalog = researchCatalog.systems
    this._researchDirectories = researchCatalog.directories
    this._researchFilePicker = new ResearchFilePicker({
      getCatalog: () => this._researchCatalog,
      getDirectories: () => this._researchDirectories,
      setCatalog: (entries, dirs) => { this._researchCatalog = entries; this._researchDirectories = dirs },
      getTabSystemPath: (tabId) => this.store.tabs.find(t => t.id === tabId)?.researchConfig?.systemPath || null,
      onSystemOpened: (tabId, entry) => this._setResearchSystem(tabId, entry),
      onSystemPathChanged: (tabId, systemPath) => this._syncResearchSystemPath(tabId, systemPath),
      onSystemRemoved: (tabId) => this._clearResearchSystem(tabId),
      onRender: () => this.render(),
      getSidebarElement: () => this.sidebarTarget,
    })
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
    this._updateMainPanelVisibility()
    this.render()
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
      researchConfigChanged: (e: Event) => this._onResearchConfigChanged(e),
      researchResultChanged: (e: Event) => this._onResearchResultChanged(e),
      systemEditorConfigChanged: (e: Event) => this._onSystemEditorConfigChanged(e),
      systemEditorCatalogChanged: (e: Event) => this._onSystemEditorCatalogChanged(e),
      systemEditorOpenResearch: (e: Event) => this._onSystemEditorOpenResearch(e),
      systemEditorOpenAssistant: (e: Event) => this._onSystemEditorOpenAssistant(e),
      systemEditorLinkAssistantTarget: (e: Event) => this._onSystemEditorLinkAssistantTarget(e),
      assistantStateChanged: (e: Event) => this._onAssistantStateChanged(e),
      assistantOpenDraftInSystemEditor: (e: Event) => this._onAssistantOpenDraftInSystemEditor(e),
      assistantApplyDraftToLinkedEditor: (e: Event) => this._onAssistantApplyDraftToLinkedEditor(e),
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
    this.element.addEventListener("research:configChanged", this._boundListeners.researchConfigChanged as EventListener)
    this.element.addEventListener("research:resultChanged", this._boundListeners.researchResultChanged as EventListener)
    this.element.addEventListener("systemeditor:configChanged", this._boundListeners.systemEditorConfigChanged as EventListener)
    this.element.addEventListener("systemeditor:catalogChanged", this._boundListeners.systemEditorCatalogChanged as EventListener)
    this.element.addEventListener("systemeditor:openResearch", this._boundListeners.systemEditorOpenResearch as EventListener)
    this.element.addEventListener("systemeditor:openAssistant", this._boundListeners.systemEditorOpenAssistant as EventListener)
    this.element.addEventListener("systemeditor:linkAssistantTarget", this._boundListeners.systemEditorLinkAssistantTarget as EventListener)
    this.element.addEventListener("assistant:stateChanged", this._boundListeners.assistantStateChanged as EventListener)
    this.element.addEventListener("assistant:openDraftInSystemEditor", this._boundListeners.assistantOpenDraftInSystemEditor as EventListener)
    this.element.addEventListener("assistant:applyDraftToLinkedEditor", this._boundListeners.assistantApplyDraftToLinkedEditor as EventListener)
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

  private _onResearchConfigChanged(e: Event) {
    const { tabId, config } = (e as CustomEvent<{ tabId: string; config: Record<string, unknown> }>).detail
    if (!tabId || !config) return
    this.store.updateResearchConfig(tabId, config)
  }

  private _onResearchResultChanged(e: Event) {
    const { tabId, result } = (e as CustomEvent<{ tabId: string; result: ResearchResult }>).detail
    if (!tabId || !result) return
    this.store.updateResearchResult(tabId, result)
  }

  private _onSystemEditorConfigChanged(e: Event) {
    const { tabId, config, diagnostics } = (e as CustomEvent<{
      tabId: string
      config: Record<string, unknown>
      diagnostics?: ResearchDslDiagnostic[]
    }>).detail
    if (!tabId || !config) return
    const currentTab = this.store.tabs.find(item => item.id === tabId && item.type === "system_editor")
    const configChanged = JSON.stringify(currentTab?.systemEditorConfig || null) !== JSON.stringify(config)
    if (configChanged) {
      this.store.updateSystemEditorConfig(tabId, config)
    }

    const tab = this.store.tabs.find(item => item.id === tabId && item.type === "system_editor")
    if (tab?.systemEditorConfig) {
      this._systemEditorDiagnostics.set(tabId, Array.isArray(diagnostics) ? diagnostics : [])
    } else {
      this._systemEditorDiagnostics.delete(tabId)
    }

    if (
      this.store.activeTab?.type === "assistant" &&
      this._assistantState.linkedTarget?.type === "system_editor" &&
      this._assistantState.linkedTarget.tabId === tabId
    ) {
      this.render()
    }
  }

  private async _onSystemEditorCatalogChanged(_e: Event) {
    const snapshot = await fetchResearchCatalog()
    this._researchCatalog = snapshot.systems
    this._researchDirectories = snapshot.directories
    this.render()
  }

  private _onSystemEditorOpenResearch(e: Event) {
    const { systemId, systemPath } = (e as CustomEvent<{ systemId: string; systemPath: string | null }>).detail
    if (!systemId) return

    const timeframe = this.config.timeframes.includes("1h") ? "1h" : (this.config.timeframes[0] || "1h")
    const tab = this.store.addResearchTab({ symbol: this.config.symbols[0] || "BTCUSD", timeframe })
    const entry = this._findResearchCatalogEntry(systemPath || null, systemId)
    if (entry) {
      this._setResearchSystem(tab.id, entry)
    } else {
      this.store.updateResearchConfig(tab.id, {
        systemId,
        systemPath: systemPath || "",
        systemYaml: "",
      })
    }
    this.render()
  }

  private _onSystemEditorOpenAssistant(e: Event) {
    const { tabId } = (e as CustomEvent<{ tabId: string }>).detail
    this._ensureAssistantTab()
    if (tabId && this.store.tabs.some(tab => tab.id === tabId && tab.type === "system_editor")) {
      const previousTabId = this._assistantState.linkedTarget?.tabId ?? null
      this._assistantState.linkedTarget = { type: "system_editor", tabId }
      if (previousTabId !== tabId) {
        // Switching to a different editor: clear the active chat so the model doesn't
        // receive history from a previous editor's context. The user can explicitly pick
        // an old chat from the list if they want it.
        this._assistantState.currentChatId = null
      }
      this._persistAssistantState()
      this._forceRevealActiveTab = true
    }
    this.render()
  }

  private _onSystemEditorLinkAssistantTarget(e: Event) {
    const detail = (e as CustomEvent<{ tabId: string }>).detail
    if (!detail?.tabId) return
    if (!this.store.tabs.some(tab => tab.id === detail.tabId && tab.type === "system_editor")) return

    const previousTabId = this._assistantState.linkedTarget?.tabId ?? null
    this._assistantState.linkedTarget = { type: "system_editor", tabId: detail.tabId }
    if (previousTabId !== detail.tabId) {
      this._assistantState.currentChatId = null
    }
    this._persistAssistantState()
    this.render()
    showToast("Assistant linked to this system editor", "success")
  }

  private _onAssistantStateChanged(e: Event) {
    const detail = (e as CustomEvent<{ state: WorkspaceAssistantState }>).detail
    if (!detail?.state) return

    this._assistantState = hydrateWorkspaceAssistantState(detail.state)
    this._reconcileAssistantLinkedTarget()
    this._persistAssistantState()
    this.render()
  }

  private _onAssistantOpenDraftInSystemEditor(e: Event) {
    const detail = (e as CustomEvent<{
      yaml: string
      suggestedSystemId?: string | null
      sourcePath?: string | null
    }>).detail
    if (!detail?.yaml) return

    const sourcePath = detail.sourcePath || null
    const suggestedSystemId = detail.suggestedSystemId || "custom_system"
    const tab = this.store.addSystemEditorTab({
      systemId: suggestedSystemId,
      sourceSystemId: sourcePath ? suggestedSystemId : null,
      sourcePath,
      directoryPath: relativeDirname(sourcePath),
      systemYaml: detail.yaml,
    })

    this._assistantState.linkedTarget = {
      type: "system_editor",
      tabId: tab.id,
    }
    this._systemEditorDiagnostics.delete(tab.id)
    this._persistAssistantState()
    this._forceRevealActiveTab = true
    this.render()
    showToast("Draft opened in System editor", "success")
  }

  private _onAssistantApplyDraftToLinkedEditor(e: Event) {
    const detail = (e as CustomEvent<{
      yaml: string
      target: AssistantTarget
      suggestedSystemId?: string | null
      sourcePath?: string | null
    }>).detail
    if (!detail?.yaml || detail.target?.type !== "system_editor") return

    const tab = this.store.tabs.find(item => item.id === detail.target?.tabId && item.type === "system_editor")
    if (!tab?.systemEditorConfig) return

    const updates: Record<string, unknown> = {
      systemYaml: detail.yaml,
    }

    if (detail.suggestedSystemId && !tab.systemEditorConfig.sourcePath) {
      updates.systemId = detail.suggestedSystemId
    }
    if (detail.sourcePath && !tab.systemEditorConfig.sourcePath) {
      updates.sourcePath = detail.sourcePath
      updates.directoryPath = relativeDirname(detail.sourcePath)
      updates.sourceSystemId = detail.suggestedSystemId || tab.systemEditorConfig.sourceSystemId
    }

    this.store.updateSystemEditorConfig(tab.id, updates)
    this._systemEditorDiagnostics.delete(tab.id)
    this._persistAssistantState()
    this.render()
    showToast("Assistant draft applied to linked editor", "success")
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
    window.removeEventListener("resize", this._onWindowResize)
    if (this._boundOpenChart) window.removeEventListener("nav:openChart", this._boundOpenChart)
    this._unbindTabBarScrollArea()
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
      this.element.removeEventListener("research:configChanged", this._boundListeners.researchConfigChanged as EventListener)
      this.element.removeEventListener("research:resultChanged", this._boundListeners.researchResultChanged as EventListener)
      this.element.removeEventListener("systemeditor:configChanged", this._boundListeners.systemEditorConfigChanged as EventListener)
      this.element.removeEventListener("systemeditor:catalogChanged", this._boundListeners.systemEditorCatalogChanged as EventListener)
      this.element.removeEventListener("systemeditor:openResearch", this._boundListeners.systemEditorOpenResearch as EventListener)
      this.element.removeEventListener("systemeditor:openAssistant", this._boundListeners.systemEditorOpenAssistant as EventListener)
      this.element.removeEventListener("systemeditor:linkAssistantTarget", this._boundListeners.systemEditorLinkAssistantTarget as EventListener)
      this.element.removeEventListener("assistant:stateChanged", this._boundListeners.assistantStateChanged as EventListener)
      this.element.removeEventListener("assistant:openDraftInSystemEditor", this._boundListeners.assistantOpenDraftInSystemEditor as EventListener)
      this.element.removeEventListener("assistant:applyDraftToLinkedEditor", this._boundListeners.assistantApplyDraftToLinkedEditor as EventListener)
      this._boundListeners = null
    }
  }

  // --- Tab CRUD ---

  addTab() {
    this.store.addTab()
    this._forceRevealActiveTab = true
    this.render()
  }
  addAssistantTab() {
    this._ensureAssistantTab()
    this._forceRevealActiveTab = true
    this.render()
  }
  addChartTab() { this.addTab() }
  addDataTab() {
    this.store.addDataTab()
    this._forceRevealActiveTab = true
    this.render()
  }
  addResearchTab() {
    const timeframe = this.config.timeframes.includes("1h") ? "1h" : (this.config.timeframes[0] || "1h")
    this.store.addResearchTab({ symbol: this.config.symbols[0] || "BTCUSD", timeframe })
    this._forceRevealActiveTab = true
    this.render()
  }
  addSystemEditorTab() {
    const activeResearch = this.store.activeTab?.type === "research" ? this.store.activeTab : null
    const systemId = activeResearch?.researchConfig?.systemId
    const sourcePath = activeResearch?.researchConfig?.systemPath || null
    this.store.addSystemEditorTab(systemId ? {
      systemId,
      sourceSystemId: systemId,
      sourcePath,
      directoryPath: relativeDirname(sourcePath),
      systemYaml: "",
    } : {})
    this._forceRevealActiveTab = true
    this.render()
  }

  createDataFromChart(e: Event) {
    e.stopPropagation()
    const tabEl = (e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null
    if (tabEl?.dataset.tabId) { this.store.addDataTabFromChart(tabEl.dataset.tabId); this.render() }
  }

  removeTab(e: Event) {
    e.stopPropagation()
    const tabId = ((e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null)?.dataset.tabId
    if (!tabId) return

    const removedTab = this.store.tabs.find(tab => tab.id === tabId) || null
    if (!this.store.removeTab(tabId)) return

    if (removedTab?.type === "system_editor") {
      this._systemEditorDiagnostics.delete(tabId)
    }

    this._reconcileAssistantLinkedTarget()
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
    if (e instanceof KeyboardEvent) e.preventDefault()
    if (!this._syncActiveResearchConfigFromSidebar()) return
    this.render()
  }

  async runResearch() {
    const next = this._syncActiveResearchConfigFromSidebar()
    if (!next) return
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return

    this.render()
    await this._activeResearchController()?.run(next)
  }

  openResearchFilePicker() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    this._researchFilePicker.openPicker(tab.id, tab.researchConfig?.systemPath || null)
  }

  closeResearchFilePicker() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    this._researchFilePicker.closePicker(tab.id)
  }

  updateResearchFilePickerQuery(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    this._researchFilePicker.updateQuery(tab.id, (e.currentTarget as HTMLInputElement).value)
  }

  selectResearchFileManagerEntry(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    this._researchFilePicker.selectEntry(tab.id, e.currentTarget as HTMLElement, (e as MouseEvent).detail >= 2)
  }

  navigateResearchFileManager(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    this._researchFilePicker.navigate(tab.id, (e.currentTarget as HTMLElement).dataset.path || "")
  }

  openResearchFileManagerEntry(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    const el = e.currentTarget as HTMLElement
    this._researchFilePicker.openEntry(tab.id, el.dataset.path || "", el.dataset.kind || "file")
  }

  confirmResearchFileSelection() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    this._researchFilePicker.confirmSelection(tab.id)
  }

  async createResearchDirectory() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    await this._researchFilePicker.createDirectory(tab.id)
  }

  async renameResearchEntry() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    await this._researchFilePicker.renameEntry(tab.id)
  }

  async deleteResearchEntry() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    await this._researchFilePicker.deleteEntry(tab.id)
  }

  stopFileManagerPropagation(e: Event) {
    e.stopPropagation()
  }


  openResearchSystemEditor() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return
    const systemId = tab.researchConfig?.systemId
    const systemPath = tab.researchConfig?.systemPath || null
    this.store.addSystemEditorTab(systemId ? {
      systemId,
      sourceSystemId: systemId,
      sourcePath: systemPath,
      directoryPath: relativeDirname(systemPath),
      systemYaml: "",
    } : {})
    this.render()
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
    this.dataActions.syncIndicatorsFromChart()
    const activeTab = this.store.activeTab
    const prevScrollLeft = this._tabScrollArea?.scrollLeft ?? this._tabBarScrollLeft
    const shouldRevealActiveTab = this._forceRevealActiveTab
    let researchValidationSystem: ResearchValidatedSystem | null = null

    if (activeTab?.type === "research" && activeTab.researchConfig) {
      const entry = this._syncResearchSystemFromCatalog(activeTab.id, activeTab.researchConfig)
      if (entry) {
        this._ensureResearchValidation(activeTab.id, entry)
      } else {
        this._researchValidation.delete(activeTab.id)
        this._researchValidationPending.delete(activeTab.id)
      }
      researchValidationSystem = this._researchValidation.get(activeTab.id)?.result?.system || null
    }

    const panel = this.store.selectedPanel
    const vp = panel?.volumeProfile ?? { enabled: false, opacity: 0.3 }
    const chartTabOptions = this.store.tabs
      .filter(t => t.type === "chart")
      .map(t => ({ id: t.id, label: this.store.tabLabel(t), primarySymbol: this.store.primaryPanel(t)?.overlays[0]?.symbol ?? null }))
    const assistantWorkspaceSnapshot = this._assistantWorkspaceSnapshot()
    const assistantLinkedTargetContext = this._assistantLinkedTargetContext()
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
      researchCatalog: this._researchCatalog,
      researchDirectories: this._researchDirectories,
      researchFilePickerOpen: this._activeResearchFilePickerOpen(),
      researchFilePickerQuery: this._activeResearchFilePickerQuery(),
      researchFilePickerDirectoryPath: this._activeResearchFilePickerDirectoryPath(),
      researchFilePickerSelectedPath: this._activeResearchFilePickerSelectedPath(),
      researchValidationSystem,
      assistantStateJson: JSON.stringify(this._assistantState),
      assistantWorkspaceSnapshotJson: JSON.stringify(assistantWorkspaceSnapshot),
      assistantLinkedTargetContextJson: JSON.stringify(assistantLinkedTargetContext),
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

  private _updateMainPanelVisibility(): void {
    if (!this.hasMainPanelTarget) return
    const isEmpty = this.store.tabs.length === 0
    this.mainPanelTarget.classList.toggle("hidden", !isEmpty)
    if (this.hasPanelsRowTarget) this.panelsRowTarget.classList.toggle("hidden", isEmpty)
  }

  private _persistAssistantState(): void {
    saveWorkspaceAssistantState(this._assistantState)
  }

  private _ensureAssistantTab() {
    return this.store.addAssistantTab()
  }

  private _reconcileAssistantLinkedTarget(): void {
    const target = this._assistantState.linkedTarget
    if (!target) return

    const tab = this.store.tabs.find(item => item.id === target.tabId && item.type === "system_editor")
    if (!tab?.systemEditorConfig) {
      this._assistantState.linkedTarget = null
      this._persistAssistantState()
      return
    }

    this._assistantState.linkedTarget = { type: "system_editor", tabId: tab.id }
  }

  private _assistantWorkspaceSnapshot(): AssistantWorkspaceSnapshot {
    return {
      activeTabId: this.store.activeTabId,
      tabs: this.store.tabs.map(tab => ({
        id: tab.id,
        type: tab.type,
        label: this.store.tabLabel(tab),
        sourcePath: tab.type === "system_editor" ? tab.systemEditorConfig?.sourcePath || null : null,
        systemId: tab.type === "system_editor" ? tab.systemEditorConfig?.systemId || null : null,
      })),
    }
  }

  private _assistantLinkedTargetContext() {
    const target = this._assistantState.linkedTarget
    if (!target || target.type !== "system_editor") return null

    const tab = this.store.tabs.find(item => item.id === target.tabId && item.type === "system_editor")
    const config = tab?.systemEditorConfig
    if (!config) return null

    return {
      system_yaml: config.systemYaml || "",
      system_id: config.systemId || null,
      source_path: config.sourcePath || null,
      yaml_hash: hashText(config.systemYaml || ""),
      diagnostics: this._systemEditorDiagnostics.get(tab.id) || [],
    }
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
    const overflowed = maxScrollLeft > 4
    const canScrollLeft = overflowed && area.scrollLeft > 4
    const canScrollRight = overflowed && area.scrollLeft < maxScrollLeft - 4

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

  private _syncActiveResearchConfigFromSidebar(): ResearchConfig | null {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return null

    const next = {
      ...(tab.researchConfig || buildDefaultResearchState({
        symbols: this.config.symbols,
        timeframes: this.config.timeframes,
        indicators: this.config.indicators,
      })),
    }

    syncResearchStateFromInputs(this.sidebarTarget, next)
    this.store.updateResearchConfig(tab.id, next)
    return next
  }

  private _activeResearchFilePickerOpen(): boolean {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return false
    return this._researchFilePicker.isOpen(tab.id)
  }

  private _activeResearchFilePickerQuery(): string {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return ""
    return this._researchFilePicker.getQuery(tab.id)
  }

  private _activeResearchFilePickerDirectoryPath(): string {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return ""
    return this._researchFilePicker.getDirectory(tab.id, tab.researchConfig?.systemPath || null)
  }

  private _activeResearchFilePickerSelectedPath(): string | null {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return null
    return this._researchFilePicker.getSelected(tab.id, tab.researchConfig?.systemPath || null)
  }

  private _activeResearchController(): { run(state?: ResearchConfig): Promise<void> } | null {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "research") return null

    const wrapper = this.panelsTarget.querySelector(`[data-tab-wrapper="${tab.id}"] [data-controller='research']`) as HTMLElement | null
    if (!wrapper) return null

    const app = this.application as StimulusApp
    return app.getControllerForElementAndIdentifier(wrapper, "research") as { run(state?: ResearchConfig): Promise<void> } | null
  }

  private _findResearchCatalogEntry(systemPath: string | null, systemId: string | null): ResearchCatalogEntry | null {
    if (systemPath) {
      const byPath = this._researchCatalog.find(entry => entry.relative_path === systemPath)
      if (byPath) return byPath
    }
    if (systemId) {
      const byId = this._researchCatalog.find(entry => entry.id === systemId)
      if (byId) return byId
    }
    return null
  }

  private _setResearchSystem(tabId: string, entry: ResearchCatalogEntry) {
    this.store.updateResearchConfig(tabId, {
      systemId: entry.id,
      systemPath: entry.relative_path,
      systemYaml: entry.yaml,
    })
    this._researchValidation.delete(tabId)
    this._researchValidationPending.delete(tabId)
    this._ensureResearchValidation(tabId, entry)
  }

  private _syncResearchSystemPath(tabId: string, systemPath: string) {
    const entry = this._findResearchCatalogEntry(systemPath, null)
    if (entry) {
      this._setResearchSystem(tabId, entry)
      return
    }

    this.store.updateResearchConfig(tabId, {
      systemPath,
      systemYaml: "",
    })
    this._researchValidation.delete(tabId)
    this._researchValidationPending.delete(tabId)
  }

  private _clearResearchSystem(tabId: string) {
    this.store.updateResearchConfig(tabId, {
      systemId: "",
      systemPath: "",
      systemYaml: "",
    })
    this._researchValidation.delete(tabId)
    this._researchValidationPending.delete(tabId)
  }

  private _syncResearchSystemFromCatalog(tabId: string, config: ResearchConfig): ResearchCatalogEntry | null {
    const entry = this._findResearchCatalogEntry(config.systemPath || null, config.systemId || null)
    if (!entry) return null

    if (
      config.systemId !== entry.id ||
      config.systemPath !== entry.relative_path ||
      config.systemYaml !== entry.yaml
    ) {
      this.store.updateResearchConfig(tabId, {
        systemId: entry.id,
        systemPath: entry.relative_path,
        systemYaml: entry.yaml,
      })
    }

    return entry
  }

  private _ensureResearchValidation(tabId: string, entry: ResearchCatalogEntry) {
    const key = `${entry.relative_path}\u0000${entry.yaml}`
    if (this._researchValidation.get(tabId)?.key === key) return
    if (this._researchValidationPending.get(tabId) === key) return

    this._researchValidationPending.set(tabId, key)

    void validateResearchSystem(entry.yaml, entry.id).then((result) => {
      if (this._researchValidationPending.get(tabId) !== key) return

      this._researchValidationPending.delete(tabId)
      this._researchValidation.set(tabId, { key, result })

      const targets = result?.system?.optimization_targets || []
      const currentTarget = this.store.tabs.find(tab => tab.id === tabId && tab.type === "research")?.researchConfig?.optimizationTarget
      const fallbackTarget = targets[0]?.value

      if (fallbackTarget && (!currentTarget || !targets.some(option => option.value === currentTarget))) {
        this.store.updateResearchConfig(tabId, { optimizationTarget: fallbackTarget })
      }

      this.render()
    })
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
