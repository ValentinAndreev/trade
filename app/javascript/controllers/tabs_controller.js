import { Controller } from "@hotwired/stimulus"
import TabStore from "../tabs/store"
import TabRenderer from "../tabs/renderer"
import { fetchConfig } from "../tabs/config"

export default class extends Controller {
  static targets = ["tabBar", "panels"]

  async connect() {
    this.store = new TabStore()
    this.config = await fetchConfig()
    this.renderer = new TabRenderer(this.tabBarTarget, this.panelsTarget, {
      controllerName: "tabs",
    })
    this.render()
  }

  // --- Actions ---

  addTab() {
    const symbol = this.config.symbols[0] || "BTCUSD"
    const timeframe = this.config.timeframes[0] || "1m"
    this.store.add(symbol, timeframe)
    this.render()
  }

  removeTab(e) {
    e.stopPropagation()
    const tabId = e.currentTarget.closest("[data-tab-id]").dataset.tabId
    if (this.store.remove(tabId)) this.render()
  }

  switchTab(e) {
    const tabId = e.currentTarget.dataset.tabId
    if (this.store.activate(tabId)) this.render()
  }

  applySettings(e) {
    const panel = e.currentTarget.closest("[data-panel-id]")
    const tabId = panel.dataset.panelId
    const symbolEl = panel.querySelector("[data-field='symbol']:not(.hidden)")
    const timeframeEl = panel.querySelector("[data-field='timeframe']:not(.hidden)")
    const symbol = symbolEl.value.trim().toUpperCase()
    const timeframe = timeframeEl.value.trim().toLowerCase()

    if (!symbol || !timeframe) return
    if (this.store.updateSettings(tabId, symbol, timeframe)) this.render()
  }

  toggleVolume(e) {
    const panel = e.currentTarget.closest("[data-panel-id]")
    const chartEl = panel.querySelector("[data-controller='chart']")
    if (!chartEl) return

    const chartCtrl = this.application.getControllerForElementAndIdentifier(chartEl, "chart")
    if (!chartCtrl) return

    chartCtrl.toggleVolume()
    e.currentTarget.classList.toggle("text-gray-300", chartCtrl.volumeVisible)
    e.currentTarget.classList.toggle("text-gray-500", !chartCtrl.volumeVisible)
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

  // --- Render ---

  render() {
    this.renderer.render(
      this.store.tabs,
      this.store.activeTabId,
      this.config.symbols,
      this.config.timeframes,
    )
  }
}
