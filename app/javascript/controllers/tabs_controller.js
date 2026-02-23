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
    input.className = "w-24 px-1 py-0 text-sm text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

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

  // --- Panel settings (sidebar) ---

  applySettings() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const symbolEl = this.sidebarTarget.querySelector("[data-field='symbol']:not(.hidden)")
    const timeframeEl = this.sidebarTarget.querySelector("[data-field='timeframe']:not(.hidden)")
    const symbol = symbolEl?.value?.trim().toUpperCase()
    const timeframe = timeframeEl?.value?.trim().toLowerCase()

    if (!symbol || !timeframe) return
    if (this.store.updatePanelSettings(panel.id, symbol, timeframe)) this.render()
  }

  setMode(e) {
    const mode = e.currentTarget.dataset.mode
    const panel = this.store.selectedPanel
    if (!panel || !mode) return

    if (this.store.setPanelMode(panel.id, mode)) {
      const chartCtrl = this._chartCtrlForPanel(panel.id)
      if (chartCtrl) chartCtrl.showMode(mode)
      this.render()
    }
  }

  switchChartType(e) {
    const type = e.currentTarget.value
    const panel = this.store.selectedPanel
    if (!panel) return

    const chartCtrl = this._chartCtrlForPanel(panel.id)
    if (!chartCtrl) return

    if (panel.mode === "volume") {
      chartCtrl.switchVolumeType(type)
    } else {
      chartCtrl.switchPriceType(type)
    }
  }

  toggleCustomInput(e) {
    const wrapper = e.currentTarget.closest("[data-combo]")
    const select = wrapper.querySelector("select")
    const input = wrapper.querySelector("input")

    if (select.classList.contains("hidden")) {
      select.classList.remove("hidden")
      input.classList.add("hidden")
      select.value = input.value || select.options[0]?.value
    } else {
      select.classList.add("hidden")
      input.classList.remove("hidden")
      input.value = select.value
      input.focus()
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

    // Snapshot all panel heights to fixed px so nothing shifts
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
      // Convert all panels back to flex-grow ratios
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

  // --- Render ---

  render() {
    this.renderer.render(
      this.store.tabs,
      this.store.activeTabId,
      this.store.selectedPanelId,
      this.config.symbols,
      this.config.timeframes,
      (tab) => this.store.tabLabel(tab),
    )
  }
}
