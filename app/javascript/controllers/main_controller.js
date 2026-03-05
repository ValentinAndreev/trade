import { Controller } from "@hotwired/stimulus"
import { apiFetch } from "../services/api_fetch"
import connectionMonitor from "../services/connection_monitor"

export default class extends Controller {
  static targets = ["grid"]

  connect() {
    this._fetchAndRender()
    this._interval = setInterval(() => this._fetchAndRender(), 60000)
    document.addEventListener("click", this._closeDropdown)
  }

  disconnect() {
    if (this._interval) clearInterval(this._interval)
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
    const tiles = tickers.map(t => this._tileHTML(t)).join("")
    this.gridTarget.innerHTML = tiles + this._addTileHTML()
    requestAnimationFrame(() => this._syncAddTileHeight())
  }

  _syncAddTileHeight() {
    const firstTile = this.gridTarget.querySelector("[data-symbol]")
    const addTile = this.gridTarget.querySelector("[data-add-tile]")
    if (firstTile && addTile) {
      addTile.style.minHeight = `${firstTile.offsetHeight}px`
    }
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
        <div class="flex items-center justify-between gap-3">
          <div class="shrink-0">
            <div class="text-gray-400 text-base mb-1">${t.symbol}</div>
            <div class="text-white text-2xl font-semibold mb-1">$${price}</div>
            <div class="${colorClass} text-base">${sign}${changePerc}% (${sign}$${changeAbs})</div>
          </div>
          <div class="shrink-0 h-12 w-[70px]">${sparkline}</div>
          <div class="shrink-0 text-gray-500 text-sm leading-relaxed">
            <div>Vol: ${vol}</div>
            <div>H: ${high}</div>
            <div>L: ${low}</div>
            ${updatedAt ? `<div class="text-gray-400">${updatedAt}</div>` : ""}
          </div>
        </div>
      </div>
    `
  }

  _addTileHTML() {
    return `
      <div class="relative bg-[#12122a] border-2 border-dashed border-[#2a2a3e] rounded-lg p-4 flex items-center justify-center cursor-pointer hover:border-blue-500/50 transition-colors"
           data-add-tile
           data-action="click->main#showAddDropdown">
        <span class="text-4xl text-gray-600 hover:text-gray-400 transition-colors">+</span>
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

    const tile = e.currentTarget
    const displayedSymbols = (this._tickers || []).map(t => t.symbol)

    try {
      const resp = await apiFetch("/api/configs")
      if (!resp || !resp.ok) return
      const config = await resp.json()
      const available = config.symbols.filter(s => !displayedSymbols.includes(s))

      if (available.length === 0) return

      const dropdown = document.createElement("div")
      dropdown.setAttribute("data-add-tile-dropdown", "")
      dropdown.className = "absolute z-50 mt-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg shadow-lg max-h-48 overflow-y-auto w-48"
      dropdown.style.top = "50%"
      dropdown.style.left = "50%"
      dropdown.style.transform = "translate(-50%, -50%)"

      dropdown.innerHTML = available.map(s => `
        <button class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-500/20 hover:text-white transition-colors"
                data-action="click->main#addSymbol"
                data-symbol="${s}">${s}</button>
      `).join("")

      tile.style.position = "relative"
      tile.appendChild(dropdown)
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
}
