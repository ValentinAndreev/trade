import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"
import { INDICATOR_META } from "../chart/indicators"
import { startPanelResize } from "../tabs/panel_resizer"

export default class extends Controller {
  static targets = ["tabBar", "panels", "sidebar"]

  async connect() {
    this.store = new TabStore()
    this.config = await fetchConfig()
    this._labelMode = false
    this._lineMode = false
    this._hlMode = false
    this._vlMode = false
    this.renderer = new TabRenderer(this.tabBarTarget, this.panelsTarget, this.sidebarTarget, {
      controllerName: "tabs",
    })
    this.render()

    // Listen for labels created from chart click
    this.element.addEventListener("label:created", (e) => this._onLabelCreated(e))

    // Listen for lines created from chart click
    this.element.addEventListener("line:created", (e) => this._onLineCreated(e))

    // Listen for hlines/vlines created from chart click
    this.element.addEventListener("hline:created", (e) => this._onHLineCreated(e))
    this.element.addEventListener("vline:created", (e) => this._onVLineCreated(e))

    // Listen for open-symbol requests from Main page tiles
    this.element.addEventListener("tabs:openSymbol", (e) => this._onOpenSymbol(e))
  }

  // --- Tab actions ---

  addTab() {
    this.store.addTab()
    this.render()
  }

  removeTab(e) {
    e.stopPropagation()
    const tabId = e.currentTarget.closest("[data-tab-id]").dataset.tabId
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

    // Remove from chart controller first
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.removeOverlay(overlayId)

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

    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (chartCtrl?.setOverlayVisibility) {
      chartCtrl.setOverlayVisibility(overlayId, visible)
    }
    this.render()
  }

  // --- Section collapse ---

  toggleChartsSection() {
    this.renderer.sidebar.chartsCollapsed = !this.renderer.sidebar.chartsCollapsed
    this.render()
  }

  toggleLabelsSection() {
    this.renderer.sidebar.labelsCollapsed = !this.renderer.sidebar.labelsCollapsed
    this.render()
  }

  toggleTextSublist() {
    this.renderer.sidebar.textCollapsed = !this.renderer.sidebar.textCollapsed
    this.render()
  }

  toggleTrendLinesSublist() {
    this.renderer.sidebar.trendLinesCollapsed = !this.renderer.sidebar.trendLinesCollapsed
    this.render()
  }

  toggleHLinesSublist() {
    this.renderer.sidebar.hlinesCollapsed = !this.renderer.sidebar.hlinesCollapsed
    this.render()
  }

  toggleVLinesSublist() {
    this.renderer.sidebar.vlinesCollapsed = !this.renderer.sidebar.vlinesCollapsed
    this.render()
  }

  // --- Clear all ---

  clearAllLabels() {
    const panel = this.store.selectedPanel
    if (!panel) return
    this.store.clearAllDrawings(panel.id)
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) {
      chartCtrl.setLabels([])
      chartCtrl.setLines([])
      chartCtrl.setHLines([])
      chartCtrl.setVLines([])
    }
    this.render()
  }

  clearAllText() {
    const panel = this.store.selectedPanel
    if (!panel || !panel.labels?.length) return
    panel.labels = []
    this.store._save()
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setLabels([])
    this.render()
  }

  clearAllLines() {
    const panel = this.store.selectedPanel
    if (!panel || !panel.lines?.length) return
    panel.lines = []
    this.store._save()
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setLines([])
    this.render()
  }

  clearAllHLines() {
    const panel = this.store.selectedPanel
    if (!panel || !panel.hlines?.length) return
    panel.hlines = []
    this.store._save()
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setHLines([])
    this.render()
  }

  clearAllVLines() {
    const panel = this.store.selectedPanel
    if (!panel || !panel.vlines?.length) return
    panel.vlines = []
    this.store._save()
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setVLines([])
    this.render()
  }

  // --- Label actions ---

  toggleLabelMode() {
    this._labelMode = !this._labelMode
    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (this._labelMode) {
      this._exitOtherModes("label", chartCtrl)
      if (chartCtrl) chartCtrl.enterLabelMode()
    } else {
      if (chartCtrl) chartCtrl.exitLabelMode()
    }
    this.render()
  }

  removeLabel(e) {
    e.stopPropagation()
    const labelId = e.currentTarget.dataset.removeLabel
    const panel = this.store.selectedPanel
    if (!panel || !labelId) return
    if (this.store.removeLabel(panel.id, labelId)) {
      const chartCtrl = this._chartCtrlForPanel(panel.id)
      if (chartCtrl) chartCtrl.setLabels(panel.labels || [])
      this.render()
    }
  }

  selectLabel(e) {
    if (e.target.closest("[data-remove-label]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return
    const labelId = e.currentTarget.dataset.labelId
    const panel = this.store.selectedPanel
    if (!panel || !labelId) return
    const label = (panel.labels || []).find(l => l.id === labelId)
    if (!label) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.scrollToLabel(label.time)
  }

  startLabelRename(e) {
    e.stopPropagation()
    if (e.target.closest("[data-remove-label]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return

    const row = e.currentTarget
    const labelId = row.dataset.labelId
    const panel = this.store.selectedPanel
    if (!panel || !labelId) return

    const label = (panel.labels || []).find(l => l.id === labelId)
    if (!label) return

    const textSpan = row.querySelector(`[data-label-text="${labelId}"]`)
    if (!textSpan) return

    const input = document.createElement("input")
    input.type = "text"
    input.value = label.text
    input.className = "w-full px-1 py-0 text-sm text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

    const commit = () => {
      const text = input.value.trim()
      if (text && text !== label.text) {
        this.store.updateLabel(panel.id, labelId, { text })
        const chartCtrl = this._chartCtrlForPanel(panel.id)
        if (chartCtrl) chartCtrl.setLabels(panel.labels || [])
      }
      this.render()
    }

    input.addEventListener("blur", commit)
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") input.blur()
      if (ev.key === "Escape") { input.value = label.text; input.blur() }
    })

    textSpan.replaceWith(input)
    input.focus()
    input.select()
  }

  _onLabelCreated(e) {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const label = this.store.addLabel(panel.id, e.detail)
    if (label) {
      const chartCtrl = this._chartCtrlForPanel(panel.id)
      if (chartCtrl) chartCtrl.setLabels(panel.labels || [])
      this.render()
    }
  }

  changeLabelColor(e) {
    e.stopPropagation()
    const labelId = e.currentTarget.dataset.labelId
    const color = e.currentTarget.value
    const panel = this.store.selectedPanel
    if (!panel || !labelId) return
    this.store.updateLabel(panel.id, labelId, { color })
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setLabels(panel.labels || [])
    this.render()
  }

  changeLabelFontSize(e) {
    e.stopPropagation()
    const labelId = e.currentTarget.dataset.labelId
    const fontSize = parseInt(e.currentTarget.value, 10)
    const panel = this.store.selectedPanel
    if (!panel || !labelId || !Number.isFinite(fontSize)) return
    this.store.updateLabel(panel.id, labelId, { fontSize })
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setLabels(panel.labels || [])
    this.render()
  }

  // --- Line actions ---

  toggleLineMode() {
    this._lineMode = !this._lineMode
    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (this._lineMode) {
      this._exitOtherModes("line", chartCtrl)
      if (chartCtrl) chartCtrl.enterLineMode()
    } else {
      if (chartCtrl) chartCtrl.exitLineMode()
    }
    this.render()
  }

  removeLine(e) {
    e.stopPropagation()
    const lineId = e.currentTarget.dataset.removeLine
    const panel = this.store.selectedPanel
    if (!panel || !lineId) return
    if (this.store.removeLine(panel.id, lineId)) {
      this._syncLinesToChart()
      this.render()
    }
  }

  selectLine(e) {
    if (e.target.closest("[data-remove-line]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return
    const lineId = e.currentTarget.dataset.lineId
    const panel = this.store.selectedPanel
    if (!panel || !lineId) return
    const line = (panel.lines || []).find(l => l.id === lineId)
    if (!line) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.scrollToLine(line.p1)
  }

  startLineRename(e) {
    e.stopPropagation()
    if (e.target.closest("[data-remove-line]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return

    const row = e.currentTarget
    const lineId = row.dataset.lineId
    const panel = this.store.selectedPanel
    if (!panel || !lineId) return

    const line = (panel.lines || []).find(l => l.id === lineId)
    if (!line) return

    const nameSpan = row.querySelector(`[data-line-name="${lineId}"]`)
    if (!nameSpan) return

    const input = document.createElement("input")
    input.type = "text"
    input.value = line.name || line.id
    input.className = "w-full px-1 py-0 text-sm text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

    const commit = () => {
      const name = input.value.trim()
      if (name && name !== line.name) {
        this.store.updateLine(panel.id, lineId, { name })
        this._syncLinesToChart()
      }
      this.render()
    }

    input.addEventListener("blur", commit)
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") input.blur()
      if (ev.key === "Escape") { input.value = line.name || line.id; input.blur() }
    })

    nameSpan.replaceWith(input)
    input.focus()
    input.select()
  }

  changeLineColor(e) {
    e.stopPropagation()
    const lineId = e.currentTarget.dataset.lineId
    const color = e.currentTarget.value
    const panel = this.store.selectedPanel
    if (!panel || !lineId) return
    this.store.updateLine(panel.id, lineId, { color })
    this._syncLinesToChart()
    this.render()
  }

  changeLineWidth(e) {
    e.stopPropagation()
    const lineId = e.currentTarget.dataset.lineId
    const width = parseInt(e.currentTarget.value, 10)
    const panel = this.store.selectedPanel
    if (!panel || !lineId || !Number.isFinite(width)) return
    this.store.updateLine(panel.id, lineId, { width })
    this._syncLinesToChart()
    this.render()
  }

  _onLineCreated(e) {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = e.detail
    // Auto-name: "{SYMBOL} line{N}"
    const existingLines = panel.lines || []
    const symbolLines = existingLines.filter(l => l.symbol === detail.symbol)
    const name = `${detail.symbol || "Line"} line${symbolLines.length + 1}`
    const line = this.store.addLine(panel.id, { ...detail, name })
    if (line) {
      this._syncLinesToChart()
      this.render()
    }
  }

  _syncLinesToChart() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (!chartCtrl) return
    chartCtrl.setLines(panel.lines || [])
  }

  // --- HLine actions ---

  toggleHLineMode() {
    this._hlMode = !this._hlMode
    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (this._hlMode) {
      this._exitOtherModes("hl", chartCtrl)
      if (chartCtrl) chartCtrl.enterHLineMode()
    } else {
      if (chartCtrl) chartCtrl.exitHLineMode()
    }
    this.render()
  }

  removeHLine(e) {
    e.stopPropagation()
    const hlineId = e.currentTarget.dataset.removeHline
    const panel = this.store.selectedPanel
    if (!panel || !hlineId) return
    if (this.store.removeHLine(panel.id, hlineId)) {
      this._syncHLinesToChart()
      this.render()
    }
  }

  changeHLineColor(e) {
    e.stopPropagation()
    const hlineId = e.currentTarget.dataset.hlineId
    const color = e.currentTarget.value
    const panel = this.store.selectedPanel
    if (!panel || !hlineId) return
    this.store.updateHLine(panel.id, hlineId, { color })
    this._syncHLinesToChart()
    this.render()
  }

  changeHLineWidth(e) {
    e.stopPropagation()
    const hlineId = e.currentTarget.dataset.hlineId
    const width = parseInt(e.currentTarget.value, 10)
    const panel = this.store.selectedPanel
    if (!panel || !hlineId || !Number.isFinite(width)) return
    this.store.updateHLine(panel.id, hlineId, { width })
    this._syncHLinesToChart()
    this.render()
  }

  startHLineRename(e) {
    e.stopPropagation()
    if (e.target.closest("[data-remove-hline]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return

    const row = e.currentTarget
    const hlineId = row.dataset.hlineId
    const panel = this.store.selectedPanel
    if (!panel || !hlineId) return

    const hl = (panel.hlines || []).find(l => l.id === hlineId)
    if (!hl) return

    const nameSpan = row.querySelector(`[data-hline-name="${hlineId}"]`)
    if (!nameSpan) return

    const input = document.createElement("input")
    input.type = "text"
    input.value = hl.name || hl.id
    input.className = "w-full px-1 py-0 text-sm text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

    const commit = () => {
      const name = input.value.trim()
      if (name && name !== hl.name) {
        this.store.updateHLine(panel.id, hlineId, { name })
      }
      this.render()
    }

    input.addEventListener("blur", commit, { once: true })
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur() }
      if (ev.key === "Escape") { input.value = hl.name || hl.id; input.blur() }
    })

    nameSpan.textContent = ""
    nameSpan.appendChild(input)
    input.focus()
    input.select()
  }

  _onHLineCreated(e) {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = e.detail
    const existing = panel.hlines || []
    const name = `${detail.symbol || "HL"} HL${existing.length + 1}`
    const hl = this.store.addHLine(panel.id, { ...detail, name })
    if (hl) {
      this._syncHLinesToChart()
      this.render()
    }
  }

  _syncHLinesToChart() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (!chartCtrl) return
    chartCtrl.setHLines(panel.hlines || [])
  }

  // --- VLine actions ---

  toggleVLineMode() {
    this._vlMode = !this._vlMode
    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (this._vlMode) {
      this._exitOtherModes("vl", chartCtrl)
      if (chartCtrl) chartCtrl.enterVLineMode()
    } else {
      if (chartCtrl) chartCtrl.exitVLineMode()
    }
    this.render()
  }

  selectVLine(e) {
    if (e.target.closest("[data-remove-vline]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return
    const vlineId = e.currentTarget.dataset.vlineId
    const panel = this.store.selectedPanel
    if (!panel || !vlineId) return
    const vl = (panel.vlines || []).find(l => l.id === vlineId)
    if (!vl) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.scrollToLabel(vl.time)
  }

  removeVLine(e) {
    e.stopPropagation()
    const vlineId = e.currentTarget.dataset.removeVline
    const panel = this.store.selectedPanel
    if (!panel || !vlineId) return
    if (this.store.removeVLine(panel.id, vlineId)) {
      this._syncVLinesToChart()
      this.render()
    }
  }

  changeVLineColor(e) {
    e.stopPropagation()
    const vlineId = e.currentTarget.dataset.vlineId
    const color = e.currentTarget.value
    const panel = this.store.selectedPanel
    if (!panel || !vlineId) return
    this.store.updateVLine(panel.id, vlineId, { color })
    this._syncVLinesToChart()
    this.render()
  }

  changeVLineWidth(e) {
    e.stopPropagation()
    const vlineId = e.currentTarget.dataset.vlineId
    const width = parseInt(e.currentTarget.value, 10)
    const panel = this.store.selectedPanel
    if (!panel || !vlineId || !Number.isFinite(width)) return
    this.store.updateVLine(panel.id, vlineId, { width })
    this._syncVLinesToChart()
    this.render()
  }

  startVLineRename(e) {
    e.stopPropagation()
    if (e.target.closest("[data-remove-vline]")) return
    if (e.target.closest("input[type='color']")) return
    if (e.target.closest("select")) return

    const row = e.currentTarget
    const vlineId = row.dataset.vlineId
    const panel = this.store.selectedPanel
    if (!panel || !vlineId) return

    const vl = (panel.vlines || []).find(l => l.id === vlineId)
    if (!vl) return

    const nameSpan = row.querySelector(`[data-vline-name="${vlineId}"]`)
    if (!nameSpan) return

    const input = document.createElement("input")
    input.type = "text"
    input.value = vl.name || vl.id
    input.className = "w-full px-1 py-0 text-sm text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

    const commit = () => {
      const name = input.value.trim()
      if (name && name !== vl.name) {
        this.store.updateVLine(panel.id, vlineId, { name })
      }
      this.render()
    }

    input.addEventListener("blur", commit, { once: true })
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur() }
      if (ev.key === "Escape") { input.value = vl.name || vl.id; input.blur() }
    })

    nameSpan.textContent = ""
    nameSpan.appendChild(input)
    input.focus()
    input.select()
  }

  _onVLineCreated(e) {
    const panel = this._panelFromEvent(e)
    if (!panel) return
    const detail = e.detail
    const existing = panel.vlines || []
    const name = `${detail.symbol || "VL"} VL${existing.length + 1}`
    const vl = this.store.addVLine(panel.id, { ...detail, name })
    if (vl) {
      this._syncVLinesToChart()
      this.render()
    }
  }

  _syncVLinesToChart() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (!chartCtrl) return
    chartCtrl.setVLines(panel.vlines || [])
  }

  // --- Volume Profile ---

  toggleVolumeProfile() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const vp = panel.volumeProfile || {}
    const newEnabled = !vp.enabled
    this.store.setVolumeProfile(panel.id, { enabled: newEnabled })

    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) {
      if (newEnabled) {
        chartCtrl.enableVolumeProfile(vp.opacity ?? 0.3)
      } else {
        chartCtrl.disableVolumeProfile()
      }
    }
    this.render()
  }

  adjustVpOpacity(e) {
    const percent = parseInt(e.currentTarget.value, 10)
    if (!Number.isFinite(percent)) return
    const opacity = Math.max(0, Math.min(100, percent)) / 100

    const panel = this.store.selectedPanel
    if (!panel) return

    this.store.setVolumeProfile(panel.id, { opacity })

    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (chartCtrl) chartCtrl.setVolumeProfileOpacity(opacity)

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
    let symbolChanged = false
    let indicatorChanged = false

    if (overlay.mode === "indicator") {
      // Indicator: symbol comes from source overlay, not symbol field
      const typeEl = this.sidebarTarget.querySelector("[data-field='indicatorType']")
      const type = typeEl?.value || overlay.indicatorType || "sma"

      const paramInputs = this.sidebarTarget.querySelectorAll("[data-indicator-param]")
      const params = {}
      paramInputs.forEach(input => {
        const key = input.dataset.indicatorParam
        const val = parseFloat(input.value)
        if (!Number.isNaN(val)) params[key] = val
      })

      const pinnedEl = this.sidebarTarget.querySelector("[data-field='pinnedTo']")
      const pinnedTo = pinnedEl?.value || null

      // Copy symbol from source overlay so chart controller can load data
      if (pinnedTo) {
        const sourceOverlay = this.store.overlayById(pinnedTo)
        if (sourceOverlay?.symbol) {
          symbolChanged = this.store.updateOverlaySymbol(overlay.id, sourceOverlay.symbol)
        }
      }

      this.store.setOverlayIndicatorType(overlay.id, type)
      this.store.setOverlayIndicatorParams(overlay.id, params)
      this.store.setOverlayPinnedTo(overlay.id, pinnedTo)
      indicatorChanged = true

      // If chart already exists and no full re-render needed, update indicator live
      if (!timeframeChanged && !symbolChanged) {
        const chartCtrl = this._chartCtrlForPanel(panel.id)
        if (chartCtrl) {
          chartCtrl.updateIndicator(overlay.id, type, params, pinnedTo)
        }
      }
    } else {
      // Price/Volume: use symbol field
      const symbolEl = this.sidebarTarget.querySelector("[data-field='symbol']:not(.hidden)")
      const symbol = symbolEl?.value?.trim().toUpperCase()
      if (symbol) {
        symbolChanged = this.store.updateOverlaySymbol(overlay.id, symbol)
      }
    }

    if (timeframeChanged || symbolChanged || indicatorChanged) this.render()
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
      const panel = this.store.selectedPanel
      const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
      if (chartCtrl) {
        chartCtrl.showMode(overlay.id, mode)
        if (mode === "indicator") {
          chartCtrl.updateIndicator(overlay.id, overlay.indicatorType, overlay.indicatorParams, overlay.pinnedTo)
        }
      }
      this.render()
    }
  }

  switchChartType(e) {
    const type = e.currentTarget.value
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    if (this.store.setOverlayChartType(overlay.id, type)) {
      const panel = this.store.selectedPanel
      const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
      if (chartCtrl) chartCtrl.switchChartType(overlay.id, type)
    }
  }

  changePinnedTo(e) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const pinnedTo = e.currentTarget.value || null
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (chartCtrl?.setPinnedTo) {
      chartCtrl.setPinnedTo(overlay.id, pinnedTo)
    }
  }

  cycleIndicatorFilter() {
    const filters = ["all", "client", "server"]
    const current = this.renderer.sidebar.indicatorFilter || "all"
    const next = filters[(filters.indexOf(current) + 1) % filters.length]
    this.renderer.sidebar.indicatorFilter = next
    this.render()
  }

  switchIndicatorType(e) {
    const type = e.currentTarget.value
    const overlay = this.store.selectedOverlay
    if (!overlay || !type) return

    const meta = INDICATOR_META[type]
    const params = meta ? { ...meta.defaults } : {}

    this.store.setOverlayIndicatorType(overlay.id, type)
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

    const typeEl = this.sidebarTarget.querySelector("[data-field='indicatorType']")
    const type = typeEl?.value || overlay.indicatorType || "sma"

    // Collect params from inputs
    const paramInputs = this.sidebarTarget.querySelectorAll("[data-indicator-param]")
    const params = {}
    paramInputs.forEach(input => {
      const key = input.dataset.indicatorParam
      const val = parseFloat(input.value)
      if (!Number.isNaN(val)) params[key] = val
    })

    const pinnedEl = this.sidebarTarget.querySelector("[data-field='pinnedTo']")
    const pinnedTo = pinnedEl?.value || null

    this.store.setOverlayIndicatorType(overlay.id, type)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (chartCtrl) {
      chartCtrl.updateIndicator(overlay.id, type, params, pinnedTo)
    }
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
      const panel = this.store.selectedPanel
      const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
      if (chartCtrl?.setOverlayColorScheme) chartCtrl.setOverlayColorScheme(overlay.id, colorScheme)
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

    const panel = this.store.selectedPanel
    const chartCtrl = panel ? this._chartCtrlForPanel(panel.id) : null
    if (chartCtrl?.setOverlayOpacity) chartCtrl.setOverlayOpacity(overlay.id, opacity)

    const valueEl = this.sidebarTarget.querySelector("[data-opacity-value]")
    if (valueEl) valueEl.textContent = `${Math.round(opacity * 100)}%`

    if (changed && e.type === "change") this.render()
  }

  toggleCustomInput(e) {
    const wrapper = e.currentTarget.closest("[data-combo]")
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

  _panelFromEvent(e) {
    const panelEl = e.target.closest("[data-panel-id]")
    if (!panelEl) return this.store.selectedPanel
    return this._panelById(panelEl.dataset.panelId) || this.store.selectedPanel
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
      if (panel && chartCtrl.setOverlayVisibility) {
        panel.overlays.forEach(overlay => {
          chartCtrl.setOverlayVisibility(overlay.id, overlay.visible !== false)
          if (chartCtrl.setOverlayColorScheme) {
            chartCtrl.setOverlayColorScheme(overlay.id, overlay.colorScheme)
          }
          if (chartCtrl.setOverlayOpacity) {
            chartCtrl.setOverlayOpacity(overlay.id, overlay.opacity)
          }
        })
      }

      // Sync drawings (labels, lines, hlines, vlines) to all panels
      if (panel) {
        chartCtrl.setLabels(panel.labels || [])
        chartCtrl.setLines(panel.lines || [])
        chartCtrl.setHLines(panel.hlines || [])
        chartCtrl.setVLines(panel.vlines || [])
        // Sync volume profile
        const vp = panel.volumeProfile || {}
        if (vp.enabled && !chartCtrl._vpEnabled) {
          chartCtrl.enableVolumeProfile(vp.opacity ?? 0.3)
        } else if (!vp.enabled && chartCtrl._vpEnabled) {
          chartCtrl.disableVolumeProfile()
        }
      }

      if (panelEl.dataset.panelId === selectedPanelId) {
        chartCtrl.setSelectedOverlayScale(selectedOverlayId)
      } else {
        chartCtrl.setSelectedOverlayScale(null)
      }
    })
  }

  _panelById(panelId) {
    for (const tab of this.store.tabs) {
      const panel = tab.panels.find(p => p.id === panelId)
      if (panel) return panel
    }
    return null
  }

  _exitOtherModes(except, chartCtrl) {
    if (except !== "label" && this._labelMode) {
      this._labelMode = false
      if (chartCtrl) chartCtrl.exitLabelMode()
    }
    if (except !== "line" && this._lineMode) {
      this._lineMode = false
      if (chartCtrl) chartCtrl.exitLineMode()
    }
    if (except !== "hl" && this._hlMode) {
      this._hlMode = false
      if (chartCtrl) chartCtrl.exitHLineMode()
    }
    if (except !== "vl" && this._vlMode) {
      this._vlMode = false
      if (chartCtrl) chartCtrl.exitVLineMode()
    }
  }

  _syncLabelsAndLinesToChart() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (!chartCtrl) return
    if (this._labelMode) chartCtrl.enterLabelMode()
    else chartCtrl.exitLabelMode()
    if (this._lineMode) chartCtrl.enterLineMode()
    else chartCtrl.exitLineMode()
    if (this._hlMode) chartCtrl.enterHLineMode()
    else chartCtrl.exitHLineMode()
    if (this._vlMode) chartCtrl.enterVLineMode()
    else chartCtrl.exitVLineMode()
  }

  // --- Open symbol from Main page ---

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
    this.renderer.render(
      this.store.tabs,
      this.store.activeTabId,
      this.store.selectedPanelId,
      this.store.selectedOverlayId,
      this.config.symbols,
      this.config.timeframes,
      (tab) => this.store.tabLabel(tab),
      this.config.indicators,
      this._labelMode,
      this._lineMode,
      !!vp.enabled,
      vp.opacity ?? 0.3,
      this._hlMode,
      this._vlMode,
    )
    this._syncSelectedOverlayScale()
    requestAnimationFrame(() => {
      this._syncSelectedOverlayScale()
      this._syncLabelsAndLinesToChart()
    })
  }
}
