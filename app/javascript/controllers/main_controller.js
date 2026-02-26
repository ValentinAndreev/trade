import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["grid"]

  connect() {
    this._fetchAndRender()
    this._interval = setInterval(() => this._fetchAndRender(), 60000)
  }

  disconnect() {
    if (this._interval) clearInterval(this._interval)
  }

  async _fetchAndRender() {
    try {
      const response = await fetch("/api/tickers")
      if (!response.ok) return
      const tickers = await response.json()
      this._renderTiles(tickers)
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

    return `
      <div class="bg-[#12122a] border border-[#2a2a3e] rounded-lg p-4 hover:border-blue-500/50 cursor-pointer transition-colors"
           data-action="click->main#openChart"
           data-symbol="${t.symbol}">
        <div class="flex items-center gap-2">
          <div class="shrink-0">
            <div class="text-gray-400 text-base mb-1">${t.symbol}</div>
            <div class="text-white text-2xl font-semibold mb-1">$${price}</div>
            <div class="${colorClass} text-base mb-2">${sign}${changePerc}% (${sign}$${changeAbs})</div>
            <div class="text-gray-500 text-sm leading-relaxed">Vol: ${vol}<br>H: ${high} &nbsp; L: ${low}</div>
          </div>
          <div class="flex-1 h-16 min-w-[60px]">${sparkline}</div>
        </div>
      </div>
    `
  }

  _sparklineSVG(points, isPositive) {
    const w = 112, h = 64
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
}
