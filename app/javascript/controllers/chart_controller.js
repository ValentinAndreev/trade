import { Controller } from "@hotwired/stimulus"
import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts"
import { createConsumer } from "@rails/actioncable"

const CHART_THEME = {
  layout: { background: { color: "#1a1a2e" }, textColor: "#e0e0e0" },
  grid: { vertLines: { color: "#2a2a3e" }, horzLines: { color: "#2a2a3e" } },
  crosshair: { mode: 0 },
}

export default class extends Controller {
  static values = {
    symbol: { type: String, default: "BTCUSD" },
    timeframe: { type: String, default: "1m" },
    url: String
  }

  connect() {
    this.consumer = createConsumer()
    this.candles = []
    this.isLoadingHistory = false
    this.oldestTime = null
    this.allHistoryLoaded = false
    this.volumeVisible = this.loadVolumePref()
    this.volumeRatio = this.loadVolumeRatio()
    this.syncing = false

    this.initChart()
    this.loadData().then(() => {
      this.subscribeToScroll()
      this.connectBitfinexWs()
    })
    this.connectCable()
    this.observeResize()
  }

  disconnect() {
    this.bfxReconnect = false
    this.bfxWs?.close()
    this.subscription?.unsubscribe()
    this.consumer?.disconnect()
    this.resizeObserver?.disconnect()
    if (this.scrollHandler && this.chart) {
      this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.scrollHandler)
    }
    this.removeDivider()
    this.removeScrollbar()
    this.volumeChart?.remove()
    this.chart?.remove()
    this.priceChartEl?.remove()
    this.volumeChartEl?.remove()
    this.dividerEl?.remove()
  }

  // --- Chart init ---

  initChart() {
    // Set up flex container
    Object.assign(this.element.style, {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    })

    // Price chart container
    this.priceChartEl = document.createElement("div")
    this.priceChartEl.style.minHeight = "0"
    this.element.appendChild(this.priceChartEl)

    // Divider
    this.dividerEl = document.createElement("div")
    Object.assign(this.dividerEl.style, {
      height: "6px",
      cursor: "row-resize",
      borderTop: "1px solid #4a4a6e",
      flexShrink: "0",
    })
    this.element.appendChild(this.dividerEl)

    // Volume chart container
    this.volumeChartEl = document.createElement("div")
    this.volumeChartEl.style.minHeight = "0"
    this.element.appendChild(this.volumeChartEl)

    // Scrollbar
    this.createScrollbar()

    this.applyLayout()

    // Price chart
    this.chart = createChart(this.priceChartEl, {
      ...CHART_THEME,
      timeScale: { timeVisible: true, secondsVisible: false },
    })
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    })

    // Volume chart
    this.volumeChart = createChart(this.volumeChartEl, {
      ...CHART_THEME,
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { visible: true },
    })
    this.volumeSeries = this.volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
    })

    // Hide volume if needed
    if (!this.volumeVisible) {
      this.dividerEl.style.display = "none"
      this.volumeChartEl.style.display = "none"
      this.priceChartEl.style.flex = "1"
    }

    // Sync time scales
    this.syncTimeScales()

    // Divider drag
    this.initDividerDrag()
  }

  applyLayout() {
    this.priceChartEl.style.flex = String(1 - this.volumeRatio)
    this.volumeChartEl.style.flex = String(this.volumeRatio)
  }

  // --- Time scale sync ---

  syncTimeScales() {
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (this.syncing || !range) return
      this.syncing = true
      try { this.volumeChart.timeScale().setVisibleLogicalRange(range) } catch { /* skip */ }
      this.updateScrollbar()
      this.syncing = false
    })

    this.volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (this.syncing || !range) return
      this.syncing = true
      try { this.chart.timeScale().setVisibleLogicalRange(range) } catch { /* skip */ }
      this.updateScrollbar()
      this.syncing = false
    })
  }

  // --- Draggable divider ---

  initDividerDrag() {
    this._onDividerMouseDown = (e) => {
      e.preventDefault()
      this.dragging = true
      this.dragStartY = e.clientY
      this.dragStartRatio = this.volumeRatio
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
    }

    this._onDocumentMouseMove = (e) => {
      if (!this.dragging) return
      const totalHeight = this.element.clientHeight
      if (totalHeight === 0) return
      const deltaY = this.dragStartY - e.clientY
      const deltaRatio = deltaY / totalHeight
      this.volumeRatio = Math.min(0.8, Math.max(0.05, this.dragStartRatio + deltaRatio))
      this.applyLayout()
      this.resizeCharts()
    }

    this._onDocumentMouseUp = () => {
      if (!this.dragging) return
      this.dragging = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      this.saveVolumeRatio()
    }

    this.dividerEl.addEventListener("mousedown", this._onDividerMouseDown)
    document.addEventListener("mousemove", this._onDocumentMouseMove)
    document.addEventListener("mouseup", this._onDocumentMouseUp)
  }

  removeDivider() {
    document.removeEventListener("mousemove", this._onDocumentMouseMove)
    document.removeEventListener("mouseup", this._onDocumentMouseUp)
  }

  // --- Scrollbar ---

  createScrollbar() {
    this.scrollbarEl = document.createElement("div")
    Object.assign(this.scrollbarEl.style, {
      height: "12px",
      flexShrink: "0",
      background: "#1a1a2e",
      borderTop: "1px solid #2a2a3e",
      position: "relative",
      cursor: "pointer",
    })
    this.element.appendChild(this.scrollbarEl)

    this.scrollThumb = document.createElement("div")
    Object.assign(this.scrollThumb.style, {
      position: "absolute",
      top: "2px",
      height: "8px",
      background: "#4a4a6e",
      borderRadius: "4px",
      minWidth: "20px",
      cursor: "grab",
    })
    this.scrollbarEl.appendChild(this.scrollThumb)

    this._onThumbMouseDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.scrollDragging = true
      const range = this.chart.timeScale().getVisibleLogicalRange()
      if (!range) return
      this.scrollDragStartX = e.clientX
      this.scrollDragStartFrom = range.from
      this.scrollDragStartTo = range.to
      this.scrollThumb.style.cursor = "grabbing"
      document.body.style.userSelect = "none"
    }

    this._onScrollMouseMove = (e) => {
      if (!this.scrollDragging) return
      const trackWidth = this.scrollbarEl.clientWidth
      if (trackWidth === 0) return
      const total = this.candles.length
      const dx = e.clientX - this.scrollDragStartX
      const barsDelta = (dx / trackWidth) * total
      this.chart.timeScale().setVisibleLogicalRange({
        from: this.scrollDragStartFrom + barsDelta,
        to: this.scrollDragStartTo + barsDelta,
      })
    }

    this._onScrollMouseUp = () => {
      if (!this.scrollDragging) return
      this.scrollDragging = false
      this.scrollThumb.style.cursor = "grab"
      document.body.style.userSelect = ""
    }

    this._onTrackClick = (e) => {
      if (e.target === this.scrollThumb) return
      const rect = this.scrollbarEl.getBoundingClientRect()
      const clickRatio = (e.clientX - rect.left) / rect.width
      const total = this.candles.length
      const range = this.chart.timeScale().getVisibleLogicalRange()
      if (!range) return
      const visibleBars = range.to - range.from
      const targetCenter = clickRatio * total
      const from = targetCenter - visibleBars / 2
      this.chart.timeScale().setVisibleLogicalRange({ from, to: from + visibleBars })
    }

    this.scrollThumb.addEventListener("mousedown", this._onThumbMouseDown)
    document.addEventListener("mousemove", this._onScrollMouseMove)
    document.addEventListener("mouseup", this._onScrollMouseUp)
    this.scrollbarEl.addEventListener("click", this._onTrackClick)
  }

  updateScrollbar() {
    if (!this.scrollThumb || this.candles.length === 0) return
    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const total = this.candles.length
    const trackWidth = this.scrollbarEl.clientWidth
    if (trackWidth === 0) return

    const from = Math.max(0, range.from)
    const to = Math.min(total, range.to)
    const thumbLeft = (from / total) * trackWidth
    const thumbWidth = Math.max(20, ((to - from) / total) * trackWidth)

    this.scrollThumb.style.left = `${thumbLeft}px`
    this.scrollThumb.style.width = `${thumbWidth}px`
  }

  removeScrollbar() {
    document.removeEventListener("mousemove", this._onScrollMouseMove)
    document.removeEventListener("mouseup", this._onScrollMouseUp)
    this.scrollbarEl?.remove()
  }

  // --- Volume toggle ---

  toggleVolume() {
    this.volumeVisible = !this.volumeVisible
    if (this.volumeVisible) {
      this.dividerEl.style.display = ""
      this.volumeChartEl.style.display = ""
      this.applyLayout()
    } else {
      this.dividerEl.style.display = "none"
      this.volumeChartEl.style.display = "none"
      this.priceChartEl.style.flex = "1"
    }
    this.resizeCharts()
    this.saveVolumePref()
  }

  // --- Data loading ---

  async loadData() {
    try {
      const response = await fetch(this.urlValue)
      const data = await response.json()
      this.candles = data
      if (data.length > 0) {
        this.oldestTime = data[0].time
      }
      this.series.setData(this.candles)
      this.volumeSeries.setData(this.extractVolumeData(this.candles))
      this.chart.timeScale().fitContent()
      requestAnimationFrame(() => this.updateScrollbar())
    } catch (error) {
      console.error("Failed to load candle data:", error)
    }
  }

  subscribeToScroll() {
    this.scrollHandler = (range) => {
      if (!range) return
      if (range.from < 50) {
        this.loadMoreHistory()
      }
    }
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.scrollHandler)

    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (range && range.from < 50) {
      this.loadMoreHistory()
    }
  }

  async loadMoreHistory() {
    if (this.isLoadingHistory || this.allHistoryLoaded || !this.oldestTime) return

    this.isLoadingHistory = true
    try {
      const endTime = new Date(this.oldestTime * 1000).toISOString()
      const url = new URL(this.urlValue, window.location.origin)
      url.searchParams.set("end_time", endTime)
      url.searchParams.set("limit", "500")

      const response = await fetch(url)
      const newCandles = await response.json()

      if (newCandles.length === 0) {
        this.allHistoryLoaded = true
        return
      }

      const filtered = newCandles.filter(c => c.time < this.oldestTime)
      if (filtered.length === 0) {
        this.allHistoryLoaded = true
        return
      }

      const scrollPos = this.chart.timeScale().scrollPosition()
      this.candles = [...filtered, ...this.candles]
      this.oldestTime = this.candles[0].time
      this.series.setData(this.candles)
      this.volumeSeries.setData(this.extractVolumeData(this.candles))
      this.chart.timeScale().scrollToPosition(scrollPos + filtered.length, false)
    } catch (error) {
      console.error("Failed to load history:", error)
    } finally {
      this.isLoadingHistory = false
    }
  }

  // --- WebSocket / Cable ---

  connectCable() {
    const controller = this

    this.subscription = this.consumer.subscriptions.create(
      {
        channel: "CandlesChannel",
        symbol: this.symbolValue,
        timeframe: this.timeframeValue
      },
      {
        received(candles) {
          candles.forEach(candle => {
            controller.updateCandleCache(candle)
            try { controller.series.update(candle) } catch (e) { console.log("[chart] cable update skipped:", e.message) }
            try { controller.volumeSeries.update(controller.volumePoint(candle)) } catch (e) { /* skip */ }
          })
        }
      }
    )
  }

  bfxTimeframe(tf) {
    // Bitfinex: minutes/hours stay lowercase (1m, 5m, 15m, 30m, 1h, 3h, 6h, 12h)
    // Only day/week need uppercase: 1d→1D, 7d→7D, 14d→14D, 1w→1W
    return tf.replace(/([dw])$/i, (ch) => ch.toUpperCase())
  }

  connectBitfinexWs() {
    this.bfxReconnect = true
    const key = `trade:${this.bfxTimeframe(this.timeframeValue)}:t${this.symbolValue}`

    const ws = new WebSocket("wss://api-pub.bitfinex.com/ws/2")

    ws.onopen = () => {
      ws.send(JSON.stringify({ event: "subscribe", channel: "candles", key }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.event) return
      if (msg[1] === "hb") return
      if (Array.isArray(msg[1][0])) return

      const raw = msg[1]
      if (!Array.isArray(raw) || raw.length < 6) return

      const [mts, open, close, high, low, volume] = raw
      const time = Math.floor(mts / 1000)
      if (!Number.isFinite(time) || time <= 0) return

      const candle = { time, open, high, low, close, volume }
      this.updateCandleCache(candle)
      try { this.series.update(candle) } catch (e) { console.log("[chart] bfx update skipped:", e.message) }
      try { this.volumeSeries.update(this.volumePoint(candle)) } catch (e) { /* skip */ }
    }

    ws.onclose = () => {
      if (this.bfxReconnect) setTimeout(() => this.connectBitfinexWs(), 3000)
    }
    ws.onerror = () => ws.close()
    this.bfxWs = ws
  }

  // --- Helpers ---

  updateCandleCache(candle) {
    const idx = this.candles.findIndex(c => c.time === candle.time)
    if (idx !== -1) {
      this.candles[idx] = candle
    } else if (this.candles.length === 0 || candle.time > this.candles[this.candles.length - 1].time) {
      this.candles.push(candle)
    }
  }

  extractVolumeData(candles) {
    return candles.map(c => this.volumePoint(c))
  }

  volumePoint(candle) {
    return {
      time: candle.time,
      value: candle.volume || 0,
      color: candle.close >= candle.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)"
    }
  }

  // --- Persistence ---

  loadVolumePref() {
    try {
      const val = localStorage.getItem("chart-volume-visible")
      return val === null ? true : val === "true"
    } catch { return true }
  }

  saveVolumePref() {
    try { localStorage.setItem("chart-volume-visible", this.volumeVisible) } catch { /* ignore */ }
  }

  loadVolumeRatio() {
    try {
      const val = parseFloat(localStorage.getItem("chart-volume-ratio"))
      return val > 0 && val <= 0.8 ? val : 0.25
    } catch { return 0.25 }
  }

  saveVolumeRatio() {
    try { localStorage.setItem("chart-volume-ratio", this.volumeRatio) } catch { /* ignore */ }
  }

  // --- Resize ---

  resizeCharts() {
    requestAnimationFrame(() => {
      const width = this.element.clientWidth
      const priceH = this.priceChartEl.clientHeight
      const volH = this.volumeChartEl.clientHeight
      if (width > 0 && priceH > 0) this.chart.applyOptions({ width, height: priceH })
      if (width > 0 && volH > 0 && this.volumeVisible) this.volumeChart.applyOptions({ width, height: volH })
    })
  }

  observeResize() {
    this.resizeObserver = new ResizeObserver(() => this.resizeCharts())
    this.resizeObserver.observe(this.element)
  }
}
