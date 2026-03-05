import { Controller } from "@hotwired/stimulus"
import { apiFetch } from "../services/api_fetch"
import connectionMonitor from "../services/connection_monitor"

export default class extends Controller {
  static targets = ["grid", "indicesGrid", "forexGrid", "commoditiesGrid"]

  connect() {
    this._fetchAndRender()
    this._fetchMarkets()
    this._interval = setInterval(() => this._fetchAndRender(), 60000)
    this._marketsInterval = setInterval(() => this._fetchMarkets(), 60000)
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

  async _fetchAndRender() {
    try {
      const response = await apiFetch("/api/tickers", {}, { silent: true })
      if (!response || !response.ok) return
      this._tickers = await response.json()
      this._renderTiles(this._tickers)
    } catch (e) {
      console.error("Failed to fetch tickers:", e)
    }
  }

  _renderTiles(tickers) {
    this.gridTarget.innerHTML = tickers.map(t => this._tileHTML(t)).join("")
  }

  _tileHTML(t) {
    const price = this._formatPrice(t.last_price)
    const changePerc = (t.change_24h_perc * 100).toFixed(2)
    const changeAbs = this._formatPrice(Math.abs(t.change_24h))
    const sign = t.change_24h >= 0 ? "+" : ""
    const colorClass = t.change_24h >= 0 ? "text-green-400" : "text-red-400"
    const vol = this._formatNumber(t.volume)
    const high = this._formatNumber(t.high)
    const low = this._formatNumber(t.low)
    const sparkline = t.sparkline?.length > 1 ? this._sparklineSVG(t.sparkline, t.change_24h >= 0) : ""
    const updatedAt = t.updated_at ? this._formatTime(t.updated_at) : ""

    return `
      <div class="relative group bg-[#12122a] border border-[#2a2a3e] rounded-lg p-4 hover:border-blue-500/50 cursor-pointer transition-colors"
           data-action="click->main#openChart"
           data-symbol="${t.symbol}">
        <button class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                data-action="click->main#removeTile"
                data-symbol="${t.symbol}">&times;</button>
        <div class="flex items-center justify-between gap-3 overflow-hidden">
          <div class="shrink-0">
            <div class="text-gray-400 text-base mb-1">${t.symbol}</div>
            <div class="text-white text-2xl font-semibold mb-1">$${price}</div>
            <div class="${colorClass} text-base">${sign}${changePerc}% (${sign}$${changeAbs})</div>
          </div>
          <div class="shrink-0 h-12 w-[70px]">${sparkline}</div>
          <div class="hidden min-[960px]:block shrink-0 text-gray-500 text-sm leading-relaxed whitespace-nowrap">
            <div>Vol: ${vol}</div>
            <div>H: ${high}</div>
            <div>L: ${low}</div>
            ${updatedAt ? `<div class="text-gray-400">${updatedAt}</div>` : ""}
          </div>
        </div>
      </div>
    `
  }

  async removeTile(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("remove tile")) return
    const symbol = e.currentTarget.dataset.symbol
    try {
      const resp = await apiFetch("/api/dashboard/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol })
      })
      if (!resp) return
      this._fetchAndRender()
    } catch (err) {
      console.error("Failed to remove tile:", err)
    }
  }

  async showAddDropdown(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("add tile")) return
    const existing = this.element.querySelector("[data-add-tile-dropdown]")
    if (existing) { existing.remove(); return }

    const btn = e.currentTarget
    const displayedSymbols = (this._tickers || []).map(t => t.symbol)

    try {
      const resp = await apiFetch("/api/configs")
      if (!resp || !resp.ok) return
      const config = await resp.json()
      const available = config.symbols.filter(s => !displayedSymbols.includes(s))

      if (available.length === 0) return

      const dropdown = document.createElement("div")
      dropdown.setAttribute("data-add-tile-dropdown", "")
      dropdown.className = "absolute left-0 top-full mt-1 z-50 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg shadow-lg max-h-48 overflow-y-auto w-48"

      dropdown.innerHTML = available.map(s => `
        <button class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-500/20 hover:text-white transition-colors"
                data-action="click->main#addSymbol"
                data-symbol="${s}">${s}</button>
      `).join("")

      btn.closest(".relative").appendChild(dropdown)
    } catch (err) {
      console.error("Failed to load configs:", err)
    }
  }

  async addSymbol(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("add symbol")) return
    const symbol = e.currentTarget.dataset.symbol
    const dd = this.element.querySelector("[data-add-tile-dropdown]")
    if (dd) dd.remove()

    try {
      const addResp = await apiFetch("/api/dashboard/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol })
      })
      if (!addResp) return
      this._fetchAndRender()
    } catch (err) {
      console.error("Failed to add symbol:", err)
    }
  }

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
    target.innerHTML = (quotes || []).map(q => this._marketTileHTML(q, category)).join("")
  }

  _marketTileHTML(q, category) {
    if (!q) return ""
    const isForex = category === "forex"
    const decimals = isForex ? 4 : 2
    const price = this._formatPriceD(q.price, decimals)
    const change = q.change ?? 0
    const changePct = q.change_pct ?? 0
    const sign = change >= 0 ? "+" : ""
    const colorClass = change >= 0 ? "text-green-400" : "text-red-400"
    const prefix = isForex ? "" : "$"
    const high = q.high != null ? this._formatPriceD(q.high, decimals) : null
    const low = q.low != null ? this._formatPriceD(q.low, decimals) : null
    const updatedAt = q.updated_at ? this._formatDateTime(q.updated_at) : ""

    return `
      <div class="relative group bg-[#12122a] border border-[#2a2a3e] rounded-lg p-3 transition-colors hover:border-[#3a3a5e]">
        <button class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                data-action="click->main#removeMarket"
                data-symbol="${q.symbol}" data-category="${category}">&times;</button>
        <div class="flex items-center justify-between gap-3 overflow-hidden">
          <div class="shrink-0">
            <div class="text-gray-500 text-xs mb-1">${q.name}</div>
            <div class="text-white text-lg font-semibold">${prefix}${price}</div>
            <div class="${colorClass} text-sm">${sign}${changePct.toFixed(2)}% (${sign}${this._formatPriceD(Math.abs(change), decimals)})</div>
          </div>
          <div class="hidden min-[960px]:block shrink-0 text-gray-500 text-xs leading-relaxed whitespace-nowrap text-right">
            ${high != null ? `<div>H: ${prefix}${high}</div>` : ""}
            ${low != null ? `<div>L: ${prefix}${low}</div>` : ""}
            ${updatedAt ? `<div class="text-gray-400">${updatedAt}</div>` : ""}
          </div>
        </div>
      </div>
    `
  }

  async removeMarket(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("remove instrument")) return
    const { symbol, category } = e.currentTarget.dataset
    try {
      const resp = await apiFetch("/api/markets/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, category })
      })
      if (!resp) return
      this._fetchMarkets()
    } catch (err) {
      console.error("Failed to remove market:", err)
    }
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
    if (remaining.length === 0) return

    const dropdown = document.createElement("div")
    dropdown.setAttribute("data-add-tile-dropdown", "")
    dropdown.className = "absolute left-0 top-full mt-1 z-50 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg shadow-lg max-h-48 overflow-y-auto w-52"

    dropdown.innerHTML = remaining.map(s => `
      <button class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-500/20 hover:text-white transition-colors"
              data-action="click->main#addMarket"
              data-symbol="${s}" data-category="${category}">${labels[s] || s}</button>
    `).join("")

    btn.closest(".relative").appendChild(dropdown)
  }

  async addMarket(e) {
    e.stopPropagation()
    if (!connectionMonitor.requireOnline("add instrument")) return
    const { symbol, category } = e.currentTarget.dataset
    const dd = this.element.querySelector("[data-add-tile-dropdown]")
    if (dd) dd.remove()

    try {
      const resp = await apiFetch("/api/markets/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, category })
      })
      if (!resp) return
      this._fetchMarkets()
    } catch (err) {
      console.error("Failed to add market:", err)
    }
  }

  _sparklineSVG(points, isPositive) {
    const w = 80, h = 48
    const min = Math.min(...points)
    const max = Math.max(...points)
    const range = max - min || 1

    const coords = points.map((val, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((val - min) / range) * (h - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    const color = isPositive ? "#4ade80" : "#f87171"

    return `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full h-full">
        <polyline fill="none" stroke="${color}" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"
                  points="${coords.join(" ")}" />
      </svg>
    `
  }

  openChart(e) {
    const symbol = e.currentTarget.dataset.symbol
    window.dispatchEvent(new CustomEvent("nav:openChart", { detail: { symbol } }))
  }

  _formatPrice(n) {
    if (n == null) return "—"
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  _formatPriceD(n, decimals = 2) {
    if (n == null) return "—"
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  _formatNumber(n) {
    if (n == null) return "—"
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })
  }

  _formatTime(iso) {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    return `${hh}:${mm}`
  }

  _formatDateTime(iso) {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, "0")
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    return `${dd}.${mo} ${hh}:${mm}`
  }
}
