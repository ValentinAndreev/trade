import { Controller } from "@hotwired/stimulus"
import { apiFetch } from "../services/api_fetch"
import connectionMonitor from "../services/connection_monitor"
import { showToast } from "../services/toast"
import { TICKER_POLL_INTERVAL_MS } from "../config/constants"
import { tickerTileHTML, marketTileHTML } from "../templates/main_templates"

export default class extends Controller {
  static targets = ["grid", "indicesGrid", "forexGrid", "commoditiesGrid"]

  connect() {
    this._fetchAndRender()
    this._fetchMarkets()
    this._interval = setInterval(() => this._fetchAndRender(), TICKER_POLL_INTERVAL_MS)
    this._marketsInterval = setInterval(() => this._fetchMarkets(), TICKER_POLL_INTERVAL_MS)
    document.addEventListener("click", this._closeDropdown)
  }

  disconnect() {
    if (this._interval) clearInterval(this._interval)
    if (this._marketsInterval) clearInterval(this._marketsInterval)
    document.removeEventListener("click", this._closeDropdown)
  }

  _closeDropdown = (e) => {
    if (!e.target.closest("[data-add-tile-dropdown]")) {
      const dd = this.element.querySelector("[data-add-tile-dropdown]")
      if (dd) dd.remove()
    }
  }

  // --- Crypto tickers ---

  async _fetchAndRender() {
    try {
      const response = await apiFetch("/api/tickers", {}, { silent: true })
      if (!response || !response.ok) return
      this._tickers = await response.json()
      this.gridTarget.innerHTML = this._tickers.map(t => tickerTileHTML(t)).join("")
    } catch (e) {
      console.error("Failed to fetch tickers:", e)
    }
  }

  async removeTile(e) {
    e.stopPropagation()
    const symbol = e.currentTarget.dataset.symbol
    await this._postAndRefresh("/api/dashboard/remove", { symbol }, "remove tile", () => this._fetchAndRender())
  }

  async showAddDropdown(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("add tile")) return
    const btn = e.currentTarget
    const existing = this.element.querySelector("[data-add-tile-dropdown]")
    if (existing) { existing.remove(); return }

    try {
      const resp = await apiFetch("/api/configs")
      if (!resp || !resp.ok) return
      const config = await resp.json()
      const displayed = (this._tickers || []).map(t => t.symbol)
      const available = config.symbols.filter(s => !displayed.includes(s))

      this._openDropdown(btn, available, "click->main#addSymbol")
    } catch (err) {
      console.error("Failed to load configs:", err)
    }
  }

  async addSymbol(e) {
    e.stopPropagation()
    this._dismissDropdown()
    const symbol = e.currentTarget.dataset.symbol
    await this._postAndRefresh("/api/dashboard/add", { symbol }, "add symbol", () => this._fetchAndRender())
  }

  // --- Markets (indices, forex, commodities) ---

  async _fetchMarkets() {
    try {
      const resp = await apiFetch("/api/markets", {}, { silent: true })
      if (!resp || !resp.ok) return
      const data = await resp.json()
      this._marketsAvailable = data.available || {}
      this._marketsLabels = data.labels || {}
      this._renderMarketSection("indicesGrid", data.indices, "indices")
      this._renderMarketSection("forexGrid", data.forex, "forex")
      this._renderMarketSection("commoditiesGrid", data.commodities, "commodities")
    } catch (e) {
      console.error("Failed to fetch markets:", e)
    }
  }

  _renderMarketSection(targetName, quotes, category) {
    const target = this[`has${targetName.charAt(0).toUpperCase() + targetName.slice(1)}Target`]
      ? this[`${targetName}Target`] : null
    if (!target) return
    target.innerHTML = (quotes || []).map(q => marketTileHTML(q, category)).join("")
  }

  async removeMarket(e) {
    e.stopPropagation()
    const { symbol, category } = e.currentTarget.dataset
    await this._postAndRefresh("/api/markets/remove", { symbol, category }, "remove instrument", () => this._fetchMarkets())
  }

  async showAddMarketDropdown(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("add instrument")) return
    const existing = this.element.querySelector("[data-add-tile-dropdown]")
    if (existing) { existing.remove(); return }

    const btn = e.currentTarget
    const category = btn.dataset.category
    const available = this._marketsAvailable?.[category] || []
    const labels = this._marketsLabels || {}
    const displayed = Array.from(btn.closest("section").querySelectorAll("[data-symbol]")).map(el => el.dataset.symbol)
    const remaining = available.filter(s => !displayed.includes(s))

    this._openDropdown(btn, remaining, "click->main#addMarket", { labels, extraAttrs: `data-category="${category}"` })
  }

  async addMarket(e) {
    e.stopPropagation()
    this._dismissDropdown()
    const { symbol, category } = e.currentTarget.dataset
    await this._postAndRefresh("/api/markets/add", { symbol, category }, "add instrument", () => this._fetchMarkets())
  }

  // --- Shared helpers ---

  async _postAndRefresh(url, body, action, refreshFn) {
    if (!connectionMonitor.requireOnline(action)) return
    try {
      const resp = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!resp) return
      refreshFn()
    } catch (err) {
      console.error(`Failed to ${action}:`, err)
      showToast(`Failed to ${action}`)
    }
  }

  _openDropdown(btn, items, action, { labels = {}, extraAttrs = "" } = {}) {
    if (items.length === 0) return

    const dropdown = document.createElement("div")
    dropdown.setAttribute("data-add-tile-dropdown", "")
    dropdown.className = "absolute left-0 top-full mt-1 z-50 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg shadow-lg max-h-48 overflow-y-auto w-52"

    dropdown.innerHTML = items.map(s => `
      <button class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-500/20 hover:text-white transition-colors"
              data-action="${action}"
              data-symbol="${s}" ${extraAttrs}>${labels[s] || s}</button>
    `).join("")

    const container = btn.closest(".relative")
    if (!container) return
    container.appendChild(dropdown)
  }

  _dismissDropdown() {
    const dd = this.element.querySelector("[data-add-tile-dropdown]")
    if (dd) dd.remove()
  }

  openChart(e) {
    const symbol = e.currentTarget.dataset.symbol
    window.dispatchEvent(new CustomEvent("nav:openChart", { detail: { symbol } }))
  }
}
