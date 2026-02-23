import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"

export default class extends Controller {
  static targets = ["tabBar", "panels", "sidebar"]

  async connect() {
    this.store = new TabStore()
    this.config = await fetchConfig()
    this.renderer = new TabRenderer(this.tabBarTarget, this.panelsTarget, this.sidebarTarget, {
      controllerName: "tabs",
    })
    this.render()
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

  selectPanel(e) {
    if (e.target.closest("[data-close-panel]")) return
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

  // --- Settings (sidebar) ---

  applySettings() {
    const panel = this.store.selectedPanel
    const overlay = this.store.selectedOverlay
    if (!panel) return

    const timeframeEl = this.sidebarTarget.querySelector("[data-field='timeframe']:not(.hidden)")
    const symbolEl = this.sidebarTarget.querySelector("[data-field='symbol']:not(.hidden)")
    const timeframe = timeframeEl?.value?.trim().toLowerCase()
    const symbol = symbolEl?.value?.trim().toUpperCase()

    if (!timeframe) return

    const timeframeChanged = this.store.updatePanelTimeframe(panel.id, timeframe)
    let symbolChanged = false
    if (overlay && symbol) {
      symbolChanged = this.store.updateOverlaySymbol(overlay.id, symbol)
    }

    if (timeframeChanged || symbolChanged) this.render()
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
      if (chartCtrl) chartCtrl.showMode(overlay.id, mode)
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
    e.preventDefault()
    const divider = e.currentTarget
    const wrapper = divider.closest("[data-tab-wrapper]")
    const aboveEl = wrapper.querySelector(`[data-panel-id="${divider.dataset.above}"]`)
    const belowEl = wrapper.querySelector(`[data-panel-id="${divider.dataset.below}"]`)
    if (!aboveEl || !belowEl) return

    const allPanels = [...wrapper.querySelectorAll(":scope > [data-panel-id]")]
    const heights = allPanels.map(p => p.offsetHeight)
    allPanels.forEach((p, i) => { p.style.flex = `0 0 ${heights[i]}px` })

    const startY = e.clientY
    const aboveH = aboveEl.offsetHeight
    const belowH = belowEl.offsetHeight
    const totalH = aboveH + belowH
    const minH = 40

    divider.classList.add("bg-[#5a5a7e]")

    const onMove = (ev) => {
      const delta = ev.clientY - startY
      let newAbove = aboveH + delta
      let newBelow = belowH - delta
      if (newAbove < minH) { newAbove = minH; newBelow = totalH - minH }
      if (newBelow < minH) { newBelow = minH; newAbove = totalH - minH }
      aboveEl.style.flex = `0 0 ${newAbove}px`
      belowEl.style.flex = `0 0 ${newBelow}px`
    }

    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      divider.classList.remove("bg-[#5a5a7e]")
      const finalHeights = allPanels.map(p => p.offsetHeight)
      const totalFinal = finalHeights.reduce((a, b) => a + b, 0)
      allPanels.forEach((p, i) => { p.style.flex = `${finalHeights[i] / totalFinal}` })
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  // --- Helpers ---

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

  // --- Render ---

  render() {
    this.renderer.render(
      this.store.tabs,
      this.store.activeTabId,
      this.store.selectedPanelId,
      this.store.selectedOverlayId,
      this.config.symbols,
      this.config.timeframes,
      (tab) => this.store.tabLabel(tab),
    )
    this._syncSelectedOverlayScale()
    requestAnimationFrame(() => this._syncSelectedOverlayScale())
  }
}
