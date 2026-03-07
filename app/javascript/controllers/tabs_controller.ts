import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"
import { INDICATOR_META } from "../config/indicators"
import { startPanelResize } from "../tabs/panel_resizer"
import DrawingActions from "../tabs/drawing_actions"
import connectionMonitor from "../services/connection_monitor"
import { parseConditionFromBuilder } from "../data_grid/condition_builder"
import { getHighlightStyles } from "../data_grid/condition_engine"
import ChartBridge from "../data_grid/chart_bridge"

import type { Panel, DrawingKind } from "../types/store"

export default class extends Controller {
  static targets = ["tabBar", "panels", "sidebar"]

  declare tabBarTarget: HTMLElement
  declare panelsTarget: HTMLElement
  declare sidebarTarget: HTMLElement

  store!: TabStore
  config!: { symbols: string[]; timeframes: string[]; indicators: unknown[] }
  renderer!: TabRenderer
  drawingActions!: DrawingActions
  chartBridge!: ChartBridge
  private _boundListeners: Record<string, (e: Event) => void> | null = null
  private _crosshairUnsub: (() => void) | null = null

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
    if (this.config.indicators?.length) {
      this.renderer.dataSidebar.availableIndicators = this.config.indicators as any[]
    }
    this.render()

    this._boundListeners = {
      label:  (e) => this._onDrawingCreated("labels", e),
      line:   (e) => this._onLineCreated(e),
      hline:  (e) => this._onDrawingCreated("hlines", e, (d) => `${d.symbol || "HL"} HL`),
      vline:  (e) => this._onDrawingCreated("vlines", e, (d) => `${d.symbol || "VL"} VL`),
      open:   (e) => this._onOpenSymbol(e),
    }
    this.element.addEventListener("label:created", this._boundListeners.label)
    this.element.addEventListener("line:created", this._boundListeners.line)
    this.element.addEventListener("hline:created", this._boundListeners.hline)
    this.element.addEventListener("vline:created", this._boundListeners.vline)
    this.element.addEventListener("tabs:openSymbol", this._boundListeners.open)
    this._boundListeners.rowClick = (e) => this._onDataGridRowClick(e)
    this.element.addEventListener("datagrid:rowclick", this._boundListeners.rowClick)
    this._boundListeners.timeRange = (e) => this._onDataGridTimeRange(e)
    this.element.addEventListener("datagrid:timerange", this._boundListeners.timeRange)
    this._boundListeners.gridLoaded = () => this._onDataGridLoaded()
    this.element.addEventListener("datagrid:loaded", this._boundListeners.gridLoaded)
  }

  disconnect() {
    if (this._boundListeners) {
      this.element.removeEventListener("label:created", this._boundListeners.label)
      this.element.removeEventListener("line:created", this._boundListeners.line)
      this.element.removeEventListener("hline:created", this._boundListeners.hline)
      this.element.removeEventListener("vline:created", this._boundListeners.vline)
      this.element.removeEventListener("tabs:openSymbol", this._boundListeners.open)
      if (this._boundListeners.rowClick) this.element.removeEventListener("datagrid:rowclick", this._boundListeners.rowClick)
      if (this._boundListeners.timeRange) this.element.removeEventListener("datagrid:timerange", this._boundListeners.timeRange)
      if (this._boundListeners.gridLoaded) this.element.removeEventListener("datagrid:loaded", this._boundListeners.gridLoaded)
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

  // --- Tab actions ---

  addTab() {
    this.store.addTab()
    this.render()
  }

  addChartTab() {
    this.store.addTab()
    this.render()
  }

  addDataTab() {
    this.store.addDataTab()
    this.render()
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
    if (this.store.removeTab(tabId)) this.render()
  }

  switchTab(e: Event) {
    const tabId = ((e.currentTarget as HTMLElement).closest("[data-tab-id]") as HTMLElement | null)?.dataset.tabId
    if (!tabId) return
    if (this.store.activateTab(tabId)) this.render()
  }

  startRename(e: Event) {
    e.stopPropagation()
    const labelEl = e.currentTarget as HTMLElement
    const tabBtn = labelEl.closest("[data-tab-id]") as HTMLElement | null
    if (!tabBtn) return
    const tabId = tabBtn.dataset.tabId

    const input = document.createElement("input")
    input.type = "text"
    input.value = labelEl.textContent
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
    if (!tab) return
    this.store.addPanel(tab.id)
    this.render()
  }

  removePanel(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.closePanel
    if (!panelId) return
    if (this.store.removePanel(panelId)) this.render()
  }

  movePanelUp(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.panelId
    if (!panelId) return
    if (this.store.movePanelUp(panelId)) this.render()
  }

  movePanelDown(e: Event) {
    e.stopPropagation()
    const panelId = (e.currentTarget as HTMLElement).dataset.panelId
    if (!panelId) return
    if (this.store.movePanelDown(panelId)) this.render()
  }

  selectPanel(e: Event) {
    if ((e.target as HTMLElement).closest("[data-close-panel]")) return
    if ((e.target as HTMLElement).closest("[data-move-panel]")) return
    const panelEl = (e.currentTarget as HTMLElement).closest("[data-panel-id]") as HTMLElement | null
    const panelId = panelEl?.dataset.panelId
    if (!panelId) return
    if (this.store.selectPanel(panelId)) this.render()
  }

  // --- Overlay actions ---

  addOverlay(e: Event) {
    e.stopPropagation()
    const panel = this.store.selectedPanel
    if (!panel) return
    this.store.addOverlay(panel.id)
    this.render()
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
    if (!overlayId) return
    if (this.store.selectOverlay(overlayId)) this.render()
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
    const changed = this.store.setOverlayVisible(overlayId, visible)
    if (!changed) return

    this._withChartCtrl(c => c.setOverlayVisibility(overlayId, visible))
    this.render()
  }

  // --- Section collapse ---

  _toggleSidebarSection(key: string): void {
    ;(this.renderer.sidebar as any)[key] = !(this.renderer.sidebar as any)[key]
    this.render()
  }

  toggleChartsSection()     { this._toggleSidebarSection("chartsCollapsed") }
  toggleLabelsSection()     { this._toggleSidebarSection("labelsCollapsed") }
  toggleTextSublist()       { this._toggleSidebarSection("textCollapsed") }
  toggleTrendLinesSublist() { this._toggleSidebarSection("trendLinesCollapsed") }
  toggleHLinesSublist()     { this._toggleSidebarSection("hlinesCollapsed") }
  toggleVLinesSublist()     { this._toggleSidebarSection("vlinesCollapsed") }

  // --- Clear all ---

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

  // --- Drawing mode toggles (one-liner delegations) ---

  toggleLabelMode() { this.drawingActions.toggleMode("labels") }
  toggleLineMode() { this.drawingActions.toggleMode("lines") }
  toggleHLineMode() { this.drawingActions.toggleMode("hlines") }
  toggleVLineMode() { this.drawingActions.toggleMode("vlines") }

  // --- Generic drawing item actions ---

  _drawingParams(e: Event): { kind: DrawingKind; id: string } {
    const el = e.currentTarget as HTMLElement
    return { kind: (el.dataset.drawingKind ?? "") as DrawingKind, id: el.dataset.drawingId ?? "" }
  }

  removeDrawing(e: Event) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.removeItem(kind, id)
  }

  selectDrawing(e: Event) {
    if ((e.target as HTMLElement).closest("input[type='color']") || (e.target as HTMLElement).closest("select") || (e.target as HTMLElement).closest("[data-action*='removeDrawing']")) return
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.selectItem(kind, id)
  }

  startDrawingRename(e: Event) {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest("input[type='color']") || (e.target as HTMLElement).closest("select")) return
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.startRename(kind, id, e.currentTarget as HTMLElement)
  }

  changeDrawingColor(e: Event) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.changeColor(kind, id, (e.currentTarget as HTMLInputElement).value)
  }

  changeDrawingWidth(e: Event) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.changeWidth(kind, id, parseInt((e.currentTarget as HTMLInputElement).value, 10))
  }

  changeDrawingFontSize(e: Event) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.changeFontSize(kind, id, parseInt((e.currentTarget as HTMLInputElement).value, 10))
  }

  // --- Drawing created events ---

  _onDrawingCreated(kind: string, e: Event, nameFn?: (d: any) => string): void {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = { ...(e as CustomEvent).detail }
    if (panel.timeframe) detail.timeframe = panel.timeframe
    if (nameFn) {
      const existing = (panel[kind] as any[]) || []
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

  // --- Volume Profile ---

  toggleVolumeProfile() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const vp = panel.volumeProfile ?? { enabled: false, opacity: 0.3 }
    const newEnabled = !vp.enabled
    this.store.setVolumeProfile(panel.id, { enabled: newEnabled })
    this._withChartCtrl(c => newEnabled ? c.enableVolumeProfile(vp.opacity ?? 0.3) : c.disableVolumeProfile())
    this.render()
  }

  adjustVpOpacity(e: Event) {
    const percent = parseInt((e.currentTarget as HTMLInputElement).value, 10)
    if (!Number.isFinite(percent)) return
    const opacity = Math.max(0, Math.min(100, percent)) / 100

    const panel = this.store.selectedPanel
    if (!panel) return

    this.store.setVolumeProfile(panel.id, { opacity })
    this._withChartCtrl(c => c.setVolumeProfileOpacity(opacity))

    const valueEl = this.sidebarTarget.querySelector("[data-vp-opacity-value]")
    if (valueEl) valueEl.textContent = `${Math.round(opacity * 100)}%`

    if (e.type === "change") this.render()
  }

  // --- Settings (sidebar) ---

  applySettings() {
    const panel = this.store.selectedPanel
    const overlay = this.store.selectedOverlay
    if (!panel || !overlay) return

    const timeframeEl = this.sidebarTarget.querySelector("[data-field='timeframe']:not(.hidden)") as HTMLSelectElement | null
    const timeframe = timeframeEl?.value?.trim().toLowerCase()
    if (!timeframe) return

    const timeframeChanged = this.store.updatePanelTimeframe(panel.id, timeframe)

    const changed = overlay.mode === "indicator"
      ? this._applyIndicatorSettings(panel, overlay, timeframeChanged)
      : this._applySymbolSettings(overlay, timeframeChanged)

    if (changed === null) return
    if (timeframeChanged || changed) this.render()
  }

  _applyIndicatorSettings(panel: Panel, overlay: any, timeframeChanged: boolean) {
    const { type, source, params, pinnedTo } = this._readIndicatorInputs(overlay)

    const needsBackend = timeframeChanged || source === "server"
    if (needsBackend && !connectionMonitor.requireOnline("apply settings")) return null

    let symbolChanged = false
    if (pinnedTo) {
      const sourceOverlay = this.store.overlayById(pinnedTo)
      if (sourceOverlay?.symbol) {
        symbolChanged = this.store.updateOverlaySymbol(overlay.id, sourceOverlay.symbol)
      }
    }

    this.store.setOverlayIndicatorType(overlay.id, type, source ?? undefined)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    this._withChartCtrl(c => {
      if (c.hasOverlay(overlay.id)) {
        if (!timeframeChanged && !symbolChanged) c.updateIndicator(overlay.id, type, params, pinnedTo, source ?? undefined)
      } else {
        c.addOverlay(overlay)
      }
    })
    return true
  }

  _applySymbolSettings(overlay: any, timeframeChanged: boolean) {
    const symbolEl = this.sidebarTarget.querySelector("[data-field='symbol']:not(.hidden)") as HTMLSelectElement | null
    const symbol = symbolEl?.value?.trim().toUpperCase()
    const willChangeSymbol = symbol && symbol !== overlay.symbol

    if ((timeframeChanged || willChangeSymbol) && !connectionMonitor.requireOnline("change symbol/timeframe")) return null

    if (willChangeSymbol) {
      return this.store.updateOverlaySymbol(overlay.id, symbol)
    }
    return false
  }

  applySettingsOnEnter(e: KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.applySettings()
  }

  setMode(e: Event) {
    const mode = (e.currentTarget as HTMLElement).dataset.mode
    const overlay = this.store.selectedOverlay
    if (!overlay || !mode) return

    if (this.store.setOverlayMode(overlay.id, mode as "price" | "volume" | "indicator")) {
      this._withChartCtrl(c => {
        c.showMode(overlay.id, mode)
        if (mode === "indicator") {
          c.updateIndicator(overlay.id, overlay.indicatorType, overlay.indicatorParams, overlay.pinnedTo, overlay.indicatorSource)
        }
      })
      this.render()
    }
  }

  switchChartType(e: Event) {
    const type = (e.currentTarget as HTMLInputElement).value
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    if (this.store.setOverlayChartType(overlay.id, type)) {
      this._withChartCtrl(c => c.switchChartType(overlay.id, type))
    }
  }

  changePinnedTo(e: Event) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const pinnedTo = (e.currentTarget as HTMLInputElement).value || null
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)
    this._withChartCtrl(c => c.setPinnedTo(overlay.id, pinnedTo))
  }

  cycleIndicatorFilter(): void {
    const filters = ["all", "client", "server"]
    const current = (this.renderer.sidebar as any).indicatorFilter || "all"
    const next = filters[(filters.indexOf(current) + 1) % filters.length]
    ;(this.renderer.sidebar as any).indicatorFilter = next
    this.render()
  }

  switchIndicatorType(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value
    const overlay = this.store.selectedOverlay
    if (!overlay || !raw) return

    const [type, source] = raw.includes("|") ? raw.split("|") : [raw, null]
    const meta = INDICATOR_META[type]
    const params = meta ? { ...meta.defaults } : {}

    this.store.setOverlayIndicatorType(overlay.id, type, source || (meta?.lib ? "client" : "server"))
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.render()
  }

  applyIndicatorOnEnter(e: KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.applySettings()
  }

  applyIndicator() {
    const overlay = this.store.selectedOverlay
    if (!overlay || overlay.mode !== "indicator") return

    const { type, source, params, pinnedTo } = this._readIndicatorInputs(overlay)

    if (source === "server" && !connectionMonitor.requireOnline("apply server indicator")) return

    this.store.setOverlayIndicatorType(overlay.id, type, source ?? undefined)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    this._withChartCtrl(c => {
      if (c.hasOverlay(overlay.id)) c.updateIndicator(overlay.id, type, params, pinnedTo, source ?? undefined)
      else c.addOverlay(overlay)
    })
    this.render()
  }

  switchColorScheme(e: Event) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const rawValue = (e.currentTarget as HTMLElement).dataset.colorScheme ?? (e.currentTarget as HTMLInputElement).value
    const colorScheme = parseInt(rawValue, 10)
    if (!Number.isFinite(colorScheme)) return

    const details = (e.currentTarget as HTMLElement).closest("details")
    if (details) details.open = false

    if (this.store.setOverlayColorScheme(overlay.id, colorScheme)) {
      this._withChartCtrl(c => c.setOverlayColorScheme(overlay.id, colorScheme))
      this.render()
    }
  }

  adjustOverlayOpacity(e: Event) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const percent = parseInt((e.currentTarget as HTMLInputElement).value, 10)
    if (!Number.isFinite(percent)) return
    const opacity = Math.max(0, Math.min(100, percent)) / 100

    const changed = this.store.setOverlayOpacity(overlay.id, opacity)
    this._withChartCtrl(c => c.setOverlayOpacity(overlay.id, opacity))

    const valueEl = this.sidebarTarget.querySelector("[data-opacity-value]")
    if (valueEl) valueEl.textContent = `${Math.round(opacity * 100)}%`

    if (changed && e.type === "change") this.render()
  }

  toggleCustomInput(e: Event) {
    const wrapper = (e.currentTarget as HTMLElement).closest("[data-combo]")
    if (!wrapper) return
    const select = wrapper.querySelector("select") as HTMLSelectElement | null
    const input = wrapper.querySelector("input") as HTMLInputElement | null
    const button = e.currentTarget as HTMLElement

    const updateToggleButton = (manualMode: boolean) => {
      button.textContent = manualMode ? "Manual" : "List"
      button.title = manualMode ? "Current mode: manual input" : "Current mode: list selection"
    }

    if (select?.classList.contains("hidden")) {
      select.classList.remove("hidden")
      input?.classList.add("hidden")
      select.value = input?.value || (select.options[0]?.value ?? "")
      updateToggleButton(false)
    } else {
      select?.classList.add("hidden")
      input?.classList.remove("hidden")
      if (input) input.value = select?.value ?? ""
      input?.focus()
      updateToggleButton(true)
    }
  }

  // --- Panel resize ---

  startResize(e: Event) {
    startPanelResize(e as MouseEvent, "tabs")
  }

  // --- Helpers ---

  _readIndicatorInputs(overlay: any): { type: string; source: string | null; params: Record<string, number>; pinnedTo: string | null } {
    const typeEl = this.sidebarTarget.querySelector("[data-field='indicatorType']") as HTMLSelectElement | null
    const raw = typeEl?.value || overlay.indicatorType || "sma"
    const [type, source] = raw.includes("|") ? raw.split("|") : [raw, overlay.indicatorSource || null]

    const paramInputs = this.sidebarTarget.querySelectorAll("[data-indicator-param]")
    const params: Record<string, number> = {}
    paramInputs.forEach((input: Element) => {
      const key = (input as HTMLElement).dataset.indicatorParam
      const val = parseFloat((input as HTMLInputElement).value)
      if (key && !Number.isNaN(val)) params[key] = val
    })

    const pinnedEl = this.sidebarTarget.querySelector("[data-field='pinnedTo']") as HTMLSelectElement | null
    const pinnedTo = pinnedEl?.value || null

    return { type, source, params, pinnedTo }
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

  _withChartCtrl(fn: (ctrl: any) => void): void {
    const ctrl = this._getSelectedChartCtrl()
    if (ctrl) fn(ctrl)
  }

  _chartCtrlForPanel(panelId: string): any {
    const panelEl = this.panelsTarget.querySelector(`[data-panel-id="${panelId}"]`)
    const chartEl = panelEl?.querySelector("[data-controller='chart']")
    if (!chartEl) return null
    return this.application.getControllerForElementAndIdentifier(chartEl, "chart") as any
  }

  _syncSelectedOverlayScale() {
    const selectedPanelId = this.store.selectedPanelId
    const selectedOverlayId = this.store.selectedOverlayId

    this.panelsTarget.querySelectorAll("[data-panel-id]").forEach((panelEl: Element) => {
      const chartEl = panelEl.querySelector("[data-controller='chart']")
      if (!chartEl) return
      const chartCtrl = this.application.getControllerForElementAndIdentifier(chartEl, "chart") as any
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

  _syncOverlaysToChart(chartCtrl: any, panel: Panel): void {
    if (!chartCtrl.setOverlayVisibility) return
    panel.overlays.forEach(overlay => {
      chartCtrl.showMode(overlay.id, overlay.mode || "price")
      if (overlay.mode === "indicator" && !chartCtrl.hasIndicatorSeries(overlay.id)) {
        chartCtrl.updateIndicator(overlay.id, overlay.indicatorType, overlay.indicatorParams, overlay.pinnedTo, overlay.indicatorSource)
      }
      chartCtrl.setOverlayVisibility(overlay.id, overlay.visible !== false)
      if (chartCtrl.setOverlayColorScheme) chartCtrl.setOverlayColorScheme(overlay.id, overlay.colorScheme)
      if (chartCtrl.setOverlayOpacity) chartCtrl.setOverlayOpacity(overlay.id, overlay.opacity)
    })
  }

  _syncDrawingsToChart(chartCtrl: any, panel: Panel): void {
    chartCtrl.setLabels(panel.labels || [])
    chartCtrl.setLines(panel.lines || [])
    chartCtrl.setHLines(panel.hlines || [])
    chartCtrl.setVLines(panel.vlines || [])
  }

  _syncVpToChart(chartCtrl: any, panel: Panel): void {
    const vp = panel.volumeProfile ?? { enabled: false, opacity: 0.3 }
    if (vp.enabled && !chartCtrl.vpEnabled) {
      chartCtrl.enableVolumeProfile(vp.opacity ?? 0.3)
    } else if (!vp.enabled && chartCtrl.vpEnabled) {
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

  _onDataGridRowClick(e: Event): void {
    const time = (e as CustomEvent).detail?.time
    if (!time) return

    const tab = this.store.activeTab
    if (!tab?.dataConfig?.chartLinks?.length) return

    for (const link of tab.dataConfig.chartLinks) {
      this.chartBridge.navigateChartToTime(link.chartTabId, link.panelId, time)
    }
  }

  _onDataGridTimeRange(e: Event): void {
    const { startTime, endTime } = (e as CustomEvent).detail || {}
    if (!startTime || !endTime) return
    const tab = this.store.activeTab
    if (!tab?.dataConfig) return

    if (tab.dataConfig.startTime !== startTime || tab.dataConfig.endTime !== endTime) {
      this.store.updateDataConfig(tab.id, { startTime, endTime })
      this.render()
    }
  }

  _onDataGridLoaded(): void {
    console.log("[Tabs] _onDataGridLoaded fired")
    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    console.log("[Tabs] chart tabs:", chartTabs.length)
    for (const ct of chartTabs) {
      this._syncAllDataConditionsToChart(ct.id)
    }
  }

  _onOpenSymbol(e: Event): void {
    const symbol = (e as CustomEvent).detail?.symbol
    if (!symbol) return
    this.store.addTab({ symbol })
    this.render()
  }

  // --- Data tab sidebar actions ---

  updateDataSymbol(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const symbol = (e.currentTarget as HTMLSelectElement).value
    this.store.updateDataConfig(tab.id, { symbols: symbol ? [symbol] : [] })
    this.render()
  }

  updateDataTimeframe(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const timeframe = (e.currentTarget as HTMLSelectElement).value
    this.store.updateDataConfig(tab.id, { timeframe })
    this.render()
  }

  toggleDataColumns() {
    this.renderer.dataSidebar.columnsCollapsed = !this.renderer.dataSidebar.columnsCollapsed
    this.render()
  }

  toggleDataConditions() {
    this.renderer.dataSidebar.conditionsCollapsed = !this.renderer.dataSidebar.conditionsCollapsed
    this.render()
  }

  showAddColumn() {
    const form = this.sidebarTarget.querySelector("[data-add-column-form]")
    if (form) form.classList.remove("hidden")
  }

  hideAddColumn() {
    const form = this.sidebarTarget.querySelector("[data-add-column-form]")
    if (form) form.classList.add("hidden")
  }

  onNewColumnTypeChange(e: Event) {
    const type = (e.currentTarget as HTMLSelectElement).value
    const paramsEl = this.sidebarTarget.querySelector("[data-column-params]")
    if (!paramsEl) return

    if (type === "change") {
      paramsEl.innerHTML = this.renderer.dataSidebar._changeParamsHTML()
    } else if (type === "formula") {
      paramsEl.innerHTML = this.renderer.dataSidebar._formulaParamsHTML()
    } else if (type === "instrument") {
      paramsEl.innerHTML = this.renderer.dataSidebar._instrumentParamsHTML(this.config.symbols)
    } else {
      paramsEl.innerHTML = this.renderer.dataSidebar._indicatorParamsHTML()
    }
  }

  private _columnLabelExists(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, label: string, excludeId?: string): boolean {
    if (!tab.dataConfig) return false
    return tab.dataConfig.columns.some(c => c.label === label && c.id !== excludeId)
  }

  private _uniqueLabel(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, base: string, excludeId?: string): string {
    if (!this._columnLabelExists(tab, base, excludeId)) return base
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}_${i}`
      if (!this._columnLabelExists(tab, candidate, excludeId)) return candidate
    }
    return `${base}_${Date.now()}`
  }

  addColumn() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return

    const typeEl = this.sidebarTarget.querySelector("[data-field='newColumnType']") as HTMLSelectElement | null
    const colType = typeEl?.value || "indicator"

    if (colType === "change") {
      const periodEl = this.sidebarTarget.querySelector("[data-field='changePeriod']") as HTMLSelectElement | null
      const period = periodEl?.value || "5m"
      const label = this._uniqueLabel(tab, `change_${period}`)
      this.store.addDataColumn(tab.id, { type: "change", label, changePeriod: period })
    } else if (colType === "formula") {
      const labelEl = this.sidebarTarget.querySelector("[data-field='formulaLabel']") as HTMLInputElement | null
      const exprEl = this.sidebarTarget.querySelector("[data-field='formulaExpression']") as HTMLInputElement | null
      const rawLabel = labelEl?.value?.trim() || "formula"
      const expression = exprEl?.value?.trim() || ""
      if (!expression) return
      const label = this._uniqueLabel(tab, rawLabel)
      this.store.addDataColumn(tab.id, { type: "formula", label, expression })
    } else if (colType === "instrument") {
      const symbolEl = this.sidebarTarget.querySelector("[data-field='instrumentSymbol']") as HTMLSelectElement | null
      const fieldEl = this.sidebarTarget.querySelector("[data-field='instrumentField']") as HTMLSelectElement | null
      const symbol = symbolEl?.value?.trim() || ""
      const field = fieldEl?.value || "close"
      if (!symbol) return
      const label = this._uniqueLabel(tab, `${symbol.toLowerCase()}_${field}`)
      this.store.addDataColumn(tab.id, {
        type: "instrument",
        label,
        instrumentSymbol: symbol,
        instrumentField: field,
      })
    } else {
      const indTypeEl = this.sidebarTarget.querySelector("[data-field='indicatorType']") as HTMLSelectElement | null
      const indPeriodEl = this.sidebarTarget.querySelector("[data-field='indicatorPeriod']") as HTMLInputElement | null
      const indType = indTypeEl?.value?.trim().toLowerCase() || "sma"
      const period = parseInt(indPeriodEl?.value || "20", 10) || 20
      const fieldName = this._uniqueLabel(tab, `${indType}_${period}`)
      this.store.addDataColumn(tab.id, {
        type: "indicator",
        label: fieldName,
        indicatorType: indType,
        indicatorParams: { period },
      })
    }

    this.render()
    if (["indicator", "change", "instrument"].includes(colType)) {
      requestAnimationFrame(() => this.loadDataGrid())
    }
  }

  updateDataDateRange() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const startEl = this.sidebarTarget.querySelector("[data-field='dataStartTime']") as HTMLInputElement | null
    const endEl = this.sidebarTarget.querySelector("[data-field='dataEndTime']") as HTMLInputElement | null
    const startTime = startEl?.value ? Math.floor(new Date(startEl.value + "Z").getTime() / 1000) : undefined
    const endTime = endEl?.value ? Math.floor(new Date(endEl.value + "Z").getTime() / 1000) : undefined
    this.store.updateDataConfig(tab.id, { startTime, endTime })
  }

  removeColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const columnId = (e.currentTarget as HTMLElement).dataset.columnId
    if (columnId) this.store.removeDataColumn(tab.id, columnId)
    this.render()
  }

  editFormulaColumn(e: Event) {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const colId = el.dataset.columnId || el.closest("[data-column-id]")?.getAttribute("data-column-id")
    if (!colId) return
    this.renderer.dataSidebar.editingFormulaId = colId
    this.render()
  }

  saveFormulaColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const el = e.currentTarget as HTMLElement
    const colId = el.dataset.columnId || el.closest("[data-column-id]")?.getAttribute("data-column-id")
    if (!colId) return

    const labelEl = this.sidebarTarget.querySelector("[data-field='editFormulaLabel']") as HTMLInputElement | null
    const exprEl = this.sidebarTarget.querySelector("[data-field='editFormulaExpression']") as HTMLInputElement | null
    const rawLabel = labelEl?.value?.trim()
    const expression = exprEl?.value?.trim()

    const col = tab.dataConfig.columns.find(c => c.id === colId)
    if (col && col.type === "formula") {
      if (rawLabel) col.label = this._uniqueLabel(tab, rawLabel, colId)
      if (expression !== undefined) col.expression = expression
      this.store.updateDataConfig(tab.id, { columns: [...tab.dataConfig.columns] })
    }

    this.renderer.dataSidebar.editingFormulaId = null
    this.render()
  }

  cancelFormulaEdit() {
    this.renderer.dataSidebar.editingFormulaId = null
    this.render()
  }

  toggleCondition(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    const checked = (e.currentTarget as HTMLInputElement).checked
    this.store.updateCondition(tab.id, condId, { enabled: checked })
    this._updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this._syncChartBridge())
  }

  removeConditionBtn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (condId) this.store.removeCondition(tab.id, condId)
    this._updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this._syncChartBridge())
  }

  showAddCondition() {
    this.renderer.dataSidebar.showConditionBuilder = true
    this.render()
  }

  confirmAddCondition() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const builder = this.sidebarTarget.querySelector("[data-condition-builder]") as HTMLElement | null
    if (!builder) return

    const condition = parseConditionFromBuilder(builder)
    if (!condition) return

    this.store.addCondition(tab.id, condition)
    this.renderer.dataSidebar.showConditionBuilder = false
    this._updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this._syncChartBridge())
  }

  cancelAddCondition() {
    this.renderer.dataSidebar.showConditionBuilder = false
    this.renderer.dataSidebar.editingConditionId = null
    this.render()
  }

  editCondition(e: Event) {
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    this.renderer.dataSidebar.editingConditionId = condId
    this.renderer.dataSidebar.showConditionBuilder = true
    this.render()
  }

  confirmEditCondition() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const condId = this.renderer.dataSidebar.editingConditionId
    if (!condId) return

    const builder = this.sidebarTarget.querySelector("[data-condition-builder]") as HTMLElement | null
    if (!builder) return

    const updates = parseConditionFromBuilder(builder)
    if (!updates) return

    this.store.updateCondition(tab.id, condId, updates)
    this.renderer.dataSidebar.showConditionBuilder = false
    this.renderer.dataSidebar.editingConditionId = null
    this._updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this._syncChartBridge())
  }

  onCondOperatorChange(e: Event) {
    const op = (e.currentTarget as HTMLSelectElement).value
    const isCross = ["cross_above", "cross_below"].includes(op)
    const isExpr = op === "expression"

    const valueRow = this.sidebarTarget.querySelector("[data-field-value-row]") as HTMLElement | null
    const crossRow = this.sidebarTarget.querySelector("[data-field-cross-row]") as HTMLElement | null
    const exprRow = this.sidebarTarget.querySelector("[data-field-expr-row]") as HTMLElement | null

    if (valueRow) valueRow.classList.toggle("hidden", isCross || isExpr)
    if (crossRow) crossRow.classList.toggle("hidden", !isCross)
    if (exprRow) exprRow.classList.toggle("hidden", !isExpr)

    if (valueRow) {
      const compareEl = valueRow.querySelector("[data-field='condCompareColumn']") as HTMLElement | null
      if (compareEl) compareEl.classList.toggle("hidden", op !== "between")
    }
  }

  onCondActionTypeChange(e: Event) {
    const type = (e.currentTarget as HTMLSelectElement).value
    const textEl = this.sidebarTarget.querySelector("[data-field='condText']") as HTMLElement | null
    if (textEl) textEl.classList.toggle("hidden", type !== "chartMarker")
  }

  addChartLink() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart" && t.panels.length > 0)
    if (!chartTabs.length) return

    const firstChart = chartTabs[0]
    const panelId = firstChart.panels[0]?.id
    if (!panelId) return

    const exists = tab.dataConfig.chartLinks.some(
      l => l.chartTabId === firstChart.id && l.panelId === panelId,
    )
    if (exists) return

    tab.dataConfig.chartLinks.push({ chartTabId: firstChart.id, panelId })
    this.store.updateDataConfig(tab.id, { chartLinks: tab.dataConfig.chartLinks })
    this._syncChartBridge()
    this.render()
  }

  removeChartLink(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const linkIdx = parseInt((e.currentTarget as HTMLElement).dataset.linkIndex || "0", 10)
    tab.dataConfig.chartLinks.splice(linkIdx, 1)
    this.store.updateDataConfig(tab.id, { chartLinks: tab.dataConfig.chartLinks })
    this.render()
  }

  _syncChartBridge() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const gridEl = this.panelsTarget.querySelector("[data-controller='data-grid']")
    if (!gridEl) return
    const ctrl = this.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    const data = ctrl?.getData() as Array<Record<string, any>> | undefined
    if (!data?.length) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    this.chartBridge.syncConditionsToChart(tab, chartTabs, data)
  }

  _updateConditionStyles() {
    const tab = this.store.activeTab
    if (!tab?.dataConfig) return

    let styleEl = document.getElementById("data-grid-condition-styles")
    if (!styleEl) {
      styleEl = document.createElement("style")
      styleEl.id = "data-grid-condition-styles"
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = getHighlightStyles(tab.dataConfig.conditions)
  }

  updateGridSettings() {
    // Settings like precision and date format are read on next render/load
  }

  async loadDataGrid() {
    const gridEl = this.panelsTarget.querySelector("[data-controller='data-grid']")
    if (!gridEl) {
      console.warn("[Tabs] No data-grid element found in panels")
      return
    }

    let ctrl = this.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    if (!ctrl) {
      await new Promise(r => requestAnimationFrame(r))
      ctrl = this.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    }
    if (!ctrl) {
      console.warn("[Tabs] data-grid controller not connected yet")
      return
    }

    await ctrl.loadData()

    const tab = this.store.activeTab
    if (tab?.type === "data" && tab.dataConfig) {
      const data = ctrl.getData() as Array<Record<string, any>>
      if (data?.length) {
        const times = data.map(r => r.time).filter(Boolean).sort((a: number, b: number) => a - b)
        if (times.length && (!tab.dataConfig.startTime || !tab.dataConfig.endTime)) {
          this.store.updateDataConfig(tab.id, {
            startTime: times[0],
            endTime: times[times.length - 1],
          })
          this.render()
        }
      }
    }

    this._syncChartBridge()
  }

  exportCsv() {
    const gridEl = this.panelsTarget.querySelector("[data-controller='data-grid']")
    if (!gridEl) return
    const ctrl = this.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    const data = ctrl?.getData() as Array<Record<string, any>> | undefined
    if (!data?.length) return

    const keys = Object.keys(data[0])
    const header = keys.join(",")
    const rows = data.map(row => keys.map(k => row[k] ?? "").join(","))
    const csv = [header, ...rows].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `data_export_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  private _syncIndicatorsFromChart() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig?.sourceTabId) return

    const chart = this.store.tabs.find(t => t.id === tab.dataConfig!.sourceTabId && t.type === "chart")
    if (!chart) return

    const existingIndicators = new Set(
      tab.dataConfig.columns
        .filter(c => c.type === "indicator")
        .map(c => `${c.indicatorType}:${JSON.stringify(c.indicatorParams || {})}`)
    )

    for (const panel of chart.panels) {
      for (const overlay of panel.overlays) {
        if (overlay.mode !== "indicator" || !overlay.indicatorType) continue
        const params = overlay.indicatorParams || {}
        const key = `${overlay.indicatorType}:${JSON.stringify(params)}`
        if (existingIndicators.has(key)) continue

        const paramStr = Object.values(params).join("_")
        const fieldName = paramStr ? `${overlay.indicatorType}_${paramStr}` : overlay.indicatorType
        this.store.addDataColumn(tab.id, {
          type: "indicator",
          label: fieldName,
          indicatorType: overlay.indicatorType,
          indicatorParams: params,
        })
        existingIndicators.add(key)
      }
    }
  }

  // --- Render ---

  render(): void {
    this._syncIndicatorsFromChart()
    const panel = this.store.selectedPanel
    const vp = panel?.volumeProfile ?? { enabled: false, opacity: 0.3 }
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
    })
    this._syncSelectedOverlayScale()
    requestAnimationFrame(() => {
      this._syncSelectedOverlayScale()
      this.drawingActions.syncAllModesToChart(this._getSelectedChartCtrl())
      this._refreshChartLabelsIfNeeded()
    })
  }

  private _refreshChartLabelsIfNeeded(): void {
    const activeTab = this.store.activeTab
    if (!activeTab || activeTab.type !== "chart") return
    this._syncAllDataConditionsToChart(activeTab.id)
  }

  private _syncAllDataConditionsToChart(chartTabId: string): void {
    const dataTabs = this.store.tabs.filter(t =>
      t.type === "data" && t.dataConfig?.chartLinks?.some(l => l.chartTabId === chartTabId)
    )
    console.log("[Tabs] _syncAllDataConditions for chart", chartTabId, "linked data tabs:", dataTabs.length)
    if (!dataTabs.length) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    for (const dt of dataTabs) {
      const gridEl = this.panelsTarget.querySelector(`[data-tab-wrapper="${dt.id}"] [data-controller='data-grid']`)
      console.log("[Tabs] data tab", dt.id, "gridEl found:", !!gridEl)
      if (!gridEl) continue
      const ctrl = this.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
      const data = ctrl?.getData() as Array<Record<string, any>> | undefined
      console.log("[Tabs] data tab", dt.id, "ctrl:", !!ctrl, "rows:", data?.length ?? 0, "conditions:", dt.dataConfig?.conditions?.length ?? 0)
      if (!data?.length) continue
      this.chartBridge.syncConditionsToChart(dt, chartTabs, data)
    }
  }
}
