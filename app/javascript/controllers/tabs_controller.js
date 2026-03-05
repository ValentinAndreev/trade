import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"
import { INDICATOR_META } from "../config/indicators"
import { startPanelResize } from "../tabs/panel_resizer"
import DrawingActions from "../tabs/drawing_actions"
import connectionMonitor from "../services/connection_monitor"

export default class extends Controller {
  static targets = ["tabBar", "panels", "sidebar"]

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
  }

  disconnect() {
    if (this._boundListeners) {
      this.element.removeEventListener("label:created", this._boundListeners.label)
      this.element.removeEventListener("line:created", this._boundListeners.line)
      this.element.removeEventListener("hline:created", this._boundListeners.hline)
      this.element.removeEventListener("vline:created", this._boundListeners.vline)
      this.element.removeEventListener("tabs:openSymbol", this._boundListeners.open)
      this._boundListeners = null
    }
  }

  // --- Tab actions ---

  addTab() {
    this.store.addTab()
    this.render()
  }

  removeTab(e) {
    e.stopPropagation()
    const tabId = e.currentTarget.closest("[data-tab-id]")?.dataset.tabId
    if (!tabId) return
    if (this.store.removeTab(tabId)) this.render()
  }

  switchTab(e) {
    const tabId = e.currentTarget.closest("[data-tab-id]")?.dataset.tabId
    if (!tabId) return
    if (this.store.activateTab(tabId)) this.render()
  }

  startRename(e) {
    e.stopPropagation()
    const labelEl = e.currentTarget
    const tabBtn = labelEl.closest("[data-tab-id]")
    if (!tabBtn) return
    const tabId = tabBtn.dataset.tabId

    const input = document.createElement("input")
    input.type = "text"
    input.value = labelEl.textContent
    input.className = "w-36 px-2 py-1 text-base text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

    const commit = () => {
      const name = input.value.trim()
      if (name) this.store.renameTab(tabId, name)
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

  addPanel(e) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab) return
    this.store.addPanel(tab.id)
    this.render()
  }

  removePanel(e) {
    e.stopPropagation()
    const panelId = e.currentTarget.dataset.closePanel
    if (this.store.removePanel(panelId)) this.render()
  }

  movePanelUp(e) {
    e.stopPropagation()
    const panelId = e.currentTarget.dataset.panelId
    if (!panelId) return
    if (this.store.movePanelUp(panelId)) this.render()
  }

  movePanelDown(e) {
    e.stopPropagation()
    const panelId = e.currentTarget.dataset.panelId
    if (!panelId) return
    if (this.store.movePanelDown(panelId)) this.render()
  }

  selectPanel(e) {
    if (e.target.closest("[data-close-panel]")) return
    if (e.target.closest("[data-move-panel]")) return
    const panelEl = e.currentTarget.closest("[data-panel-id]")
    const panelId = panelEl?.dataset.panelId
    if (!panelId) return
    if (this.store.selectPanel(panelId)) this.render()
  }

  // --- Overlay actions ---

  addOverlay(e) {
    e.stopPropagation()
    const panel = this.store.selectedPanel
    if (!panel) return
    this.store.addOverlay(panel.id)
    this.render()
  }

  removeOverlay(e) {
    e.stopPropagation()
    const overlayId = e.currentTarget.dataset.removeOverlay
    const panel = this.store.selectedPanel
    if (!panel || !overlayId) return
    this._withChartCtrl(c => c.removeOverlay(overlayId))
    if (this.store.removeOverlay(panel.id, overlayId)) this.render()
  }

  selectOverlay(e) {
    if (e.target.closest("[data-toggle-overlay-visibility]")) return
    if (e.target.closest("[data-remove-overlay]")) return
    const overlayId = e.currentTarget.dataset.overlayId
    if (!overlayId) return
    if (this.store.selectOverlay(overlayId)) this.render()
  }

  toggleOverlayVisibility(e) {
    e.stopPropagation()
    const overlayId =
      e.currentTarget.dataset.overlayId ||
      e.currentTarget.closest("[data-overlay-id]")?.dataset.overlayId ||
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

  _toggleSidebarSection(key) {
    this.renderer.sidebar[key] = !this.renderer.sidebar[key]
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

  _drawingParams(e) {
    const el = e.currentTarget
    return { kind: el.dataset.drawingKind, id: el.dataset.drawingId }
  }

  removeDrawing(e) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.removeItem(kind, id)
  }

  selectDrawing(e) {
    if (e.target.closest("input[type='color']") || e.target.closest("select") || e.target.closest("[data-action*='removeDrawing']")) return
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.selectItem(kind, id)
  }

  startDrawingRename(e) {
    e.stopPropagation()
    if (e.target.closest("input[type='color']") || e.target.closest("select")) return
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.startRename(kind, id, e.currentTarget)
  }

  changeDrawingColor(e) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.changeColor(kind, id, e.currentTarget.value)
  }

  changeDrawingWidth(e) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.changeWidth(kind, id, parseInt(e.currentTarget.value, 10))
  }

  changeDrawingFontSize(e) {
    e.stopPropagation()
    const { kind, id } = this._drawingParams(e)
    this.drawingActions.changeFontSize(kind, id, parseInt(e.currentTarget.value, 10))
  }

  // --- Drawing created events ---

  _onDrawingCreated(kind, e, nameFn) {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = { ...e.detail }
    if (panel.timeframe) detail.timeframe = panel.timeframe
    if (nameFn) {
      const existing = panel[kind] || []
      detail.name = `${nameFn(detail)}${existing.length + 1}`
    }
    this.drawingActions.onCreated(kind, panel, detail)
  }

  _onLineCreated(e) {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = e.detail
    const existingLines = panel.lines || []
    const symbolLines = existingLines.filter(l => l.symbol === detail.symbol)
    const name = `${detail.symbol || "Line"} line${symbolLines.length + 1}`
    this.drawingActions.onCreated("lines", panel, { ...detail, name, timeframe: panel.timeframe })
  }

  // --- Volume Profile ---

  toggleVolumeProfile() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const vp = panel.volumeProfile || {}
    const newEnabled = !vp.enabled
    this.store.setVolumeProfile(panel.id, { enabled: newEnabled })
    this._withChartCtrl(c => newEnabled ? c.enableVolumeProfile(vp.opacity ?? 0.3) : c.disableVolumeProfile())
    this.render()
  }

  adjustVpOpacity(e) {
    const percent = parseInt(e.currentTarget.value, 10)
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

    const timeframeEl = this.sidebarTarget.querySelector("[data-field='timeframe']:not(.hidden)")
    const timeframe = timeframeEl?.value?.trim().toLowerCase()
    if (!timeframe) return

    const timeframeChanged = this.store.updatePanelTimeframe(panel.id, timeframe)

    const changed = overlay.mode === "indicator"
      ? this._applyIndicatorSettings(panel, overlay, timeframeChanged)
      : this._applySymbolSettings(overlay, timeframeChanged)

    if (changed === null) return
    if (timeframeChanged || changed) this.render()
  }

  _applyIndicatorSettings(panel, overlay, timeframeChanged) {
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

    this.store.setOverlayIndicatorType(overlay.id, type, source)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    this._withChartCtrl(c => {
      if (c.hasOverlay(overlay.id)) {
        if (!timeframeChanged && !symbolChanged) c.updateIndicator(overlay.id, type, params, pinnedTo, source)
      } else {
        c.addOverlay(overlay)
      }
    })
    return true
  }

  _applySymbolSettings(overlay, timeframeChanged) {
    const symbolEl = this.sidebarTarget.querySelector("[data-field='symbol']:not(.hidden)")
    const symbol = symbolEl?.value?.trim().toUpperCase()
    const willChangeSymbol = symbol && symbol !== overlay.symbol

    if ((timeframeChanged || willChangeSymbol) && !connectionMonitor.requireOnline("change symbol/timeframe")) return null

    if (willChangeSymbol) {
      return this.store.updateOverlaySymbol(overlay.id, symbol)
    }
    return false
  }

  applySettingsOnEnter(e) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.applySettings()
  }

  setMode(e) {
    const mode = e.currentTarget.dataset.mode
    const overlay = this.store.selectedOverlay
    if (!overlay || !mode) return

    if (this.store.setOverlayMode(overlay.id, mode)) {
      this._withChartCtrl(c => {
        c.showMode(overlay.id, mode)
        if (mode === "indicator") {
          c.updateIndicator(overlay.id, overlay.indicatorType, overlay.indicatorParams, overlay.pinnedTo, overlay.indicatorSource)
        }
      })
      this.render()
    }
  }

  switchChartType(e) {
    const type = e.currentTarget.value
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    if (this.store.setOverlayChartType(overlay.id, type)) {
      this._withChartCtrl(c => c.switchChartType(overlay.id, type))
    }
  }

  changePinnedTo(e) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const pinnedTo = e.currentTarget.value || null
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)
    this._withChartCtrl(c => c.setPinnedTo(overlay.id, pinnedTo))
  }

  cycleIndicatorFilter() {
    const filters = ["all", "client", "server"]
    const current = this.renderer.sidebar.indicatorFilter || "all"
    const next = filters[(filters.indexOf(current) + 1) % filters.length]
    this.renderer.sidebar.indicatorFilter = next
    this.render()
  }

  switchIndicatorType(e) {
    const raw = e.currentTarget.value
    const overlay = this.store.selectedOverlay
    if (!overlay || !raw) return

    const [type, source] = raw.includes("|") ? raw.split("|") : [raw, null]
    const meta = INDICATOR_META[type]
    const params = meta ? { ...meta.defaults } : {}

    this.store.setOverlayIndicatorType(overlay.id, type, source || (meta?.lib ? "client" : "server"))
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.render()
  }

  applyIndicatorOnEnter(e) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.applySettings()
  }

  applyIndicator() {
    const overlay = this.store.selectedOverlay
    if (!overlay || overlay.mode !== "indicator") return

    const { type, source, params, pinnedTo } = this._readIndicatorInputs(overlay)

    if (source === "server" && !connectionMonitor.requireOnline("apply server indicator")) return

    this.store.setOverlayIndicatorType(overlay.id, type, source)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    this._withChartCtrl(c => {
      if (c.hasOverlay(overlay.id)) c.updateIndicator(overlay.id, type, params, pinnedTo, source)
      else c.addOverlay(overlay)
    })
    this.render()
  }

  switchColorScheme(e) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const rawValue = e.currentTarget.dataset.colorScheme ?? e.currentTarget.value
    const colorScheme = parseInt(rawValue, 10)
    if (!Number.isFinite(colorScheme)) return

    const details = e.currentTarget.closest("details")
    if (details) details.open = false

    if (this.store.setOverlayColorScheme(overlay.id, colorScheme)) {
      this._withChartCtrl(c => c.setOverlayColorScheme(overlay.id, colorScheme))
      this.render()
    }
  }

  adjustOverlayOpacity(e) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const percent = parseInt(e.currentTarget.value, 10)
    if (!Number.isFinite(percent)) return
    const opacity = Math.max(0, Math.min(100, percent)) / 100

    const changed = this.store.setOverlayOpacity(overlay.id, opacity)
    this._withChartCtrl(c => c.setOverlayOpacity(overlay.id, opacity))

    const valueEl = this.sidebarTarget.querySelector("[data-opacity-value]")
    if (valueEl) valueEl.textContent = `${Math.round(opacity * 100)}%`

    if (changed && e.type === "change") this.render()
  }

  toggleCustomInput(e) {
    const wrapper = e.currentTarget.closest("[data-combo]")
    if (!wrapper) return
    const select = wrapper.querySelector("select")
    const input = wrapper.querySelector("input")
    const button = e.currentTarget

    const updateToggleButton = (manualMode) => {
      button.textContent = manualMode ? "Manual" : "List"
      button.title = manualMode ? "Current mode: manual input" : "Current mode: list selection"
    }

    if (select.classList.contains("hidden")) {
      select.classList.remove("hidden")
      input.classList.add("hidden")
      select.value = input.value || select.options[0]?.value
      updateToggleButton(false)
    } else {
      select.classList.add("hidden")
      input.classList.remove("hidden")
      input.value = select.value
      input.focus()
      updateToggleButton(true)
    }
  }

  // --- Panel resize ---

  startResize(e) {
    startPanelResize(e, "tabs")
  }

  // --- Helpers ---

  _readIndicatorInputs(overlay) {
    const typeEl = this.sidebarTarget.querySelector("[data-field='indicatorType']")
    const raw = typeEl?.value || overlay.indicatorType || "sma"
    const [type, source] = raw.includes("|") ? raw.split("|") : [raw, overlay.indicatorSource || null]

    const paramInputs = this.sidebarTarget.querySelectorAll("[data-indicator-param]")
    const params = {}
    paramInputs.forEach(input => {
      const key = input.dataset.indicatorParam
      const val = parseFloat(input.value)
      if (!Number.isNaN(val)) params[key] = val
    })

    const pinnedEl = this.sidebarTarget.querySelector("[data-field='pinnedTo']")
    const pinnedTo = pinnedEl?.value || null

    return { type, source, params, pinnedTo }
  }

  _panelFromEvent(e) {
    const panelEl = e.target.closest("[data-panel-id]")
    if (!panelEl) return this.store.selectedPanel
    return this._panelById(panelEl.dataset.panelId) || this.store.selectedPanel
  }

  _getSelectedChartCtrl() {
    const panel = this.store.selectedPanel
    return panel ? this._chartCtrlForPanel(panel.id) : null
  }

  _withChartCtrl(fn) {
    const ctrl = this._getSelectedChartCtrl()
    if (ctrl) fn(ctrl)
  }

  _chartCtrlForPanel(panelId) {
    const panelEl = this.panelsTarget.querySelector(`[data-panel-id="${panelId}"]`)
    const chartEl = panelEl?.querySelector("[data-controller='chart']")
    if (!chartEl) return null
    return this.application.getControllerForElementAndIdentifier(chartEl, "chart")
  }

  _syncSelectedOverlayScale() {
    const selectedPanelId = this.store.selectedPanelId
    const selectedOverlayId = this.store.selectedOverlayId

    this.panelsTarget.querySelectorAll("[data-panel-id]").forEach(panelEl => {
      const chartEl = panelEl.querySelector("[data-controller='chart']")
      if (!chartEl) return
      const chartCtrl = this.application.getControllerForElementAndIdentifier(chartEl, "chart")
      if (!chartCtrl?.setSelectedOverlayScale) return

      const panel = this._panelById(panelEl.dataset.panelId)
      if (panel) {
        this._syncOverlaysToChart(chartCtrl, panel)
        this._syncDrawingsToChart(chartCtrl, panel)
        this._syncVpToChart(chartCtrl, panel)
      }

      const isSelected = panelEl.dataset.panelId === selectedPanelId
      chartCtrl.setSelectedOverlayScale(isSelected ? selectedOverlayId : null)
    })
  }

  _syncOverlaysToChart(chartCtrl, panel) {
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

  _syncDrawingsToChart(chartCtrl, panel) {
    chartCtrl.setLabels(panel.labels || [])
    chartCtrl.setLines(panel.lines || [])
    chartCtrl.setHLines(panel.hlines || [])
    chartCtrl.setVLines(panel.vlines || [])
  }

  _syncVpToChart(chartCtrl, panel) {
    const vp = panel.volumeProfile || {}
    if (vp.enabled && !chartCtrl.vpEnabled) {
      chartCtrl.enableVolumeProfile(vp.opacity ?? 0.3)
    } else if (!vp.enabled && chartCtrl.vpEnabled) {
      chartCtrl.disableVolumeProfile()
    }
  }

  _panelById(panelId) {
    for (const tab of this.store.tabs) {
      const panel = tab.panels.find(p => p.id === panelId)
      if (panel) return panel
    }
    return null
  }

  _onOpenSymbol(e) {
    const symbol = e.detail?.symbol
    if (!symbol) return
    this.store.addTab({ symbol })
    this.render()
  }

  // --- Render ---

  render() {
    const panel = this.store.selectedPanel
    const vp = panel?.volumeProfile || {}
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
    })
  }
}
