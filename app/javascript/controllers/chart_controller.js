import { Controller } from "@hotwired/stimulus"
import { createChart, CandlestickSeries } from "lightweight-charts"
import { createConsumer } from "@rails/actioncable"

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
    this.chart?.remove()
  }

  initChart() {
    this.chart = createChart(this.element, {
      layout: {
        background: { color: "#1a1a2e" },
        textColor: "#e0e0e0"
      },
      grid: {
        vertLines: { color: "#2a2a3e" },
        horzLines: { color: "#2a2a3e" }
      },
      crosshair: {
        mode: 0
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false
      }
    })

    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350"
    })
  }

  async loadData() {
    try {
      const response = await fetch(this.urlValue)
      const data = await response.json()
      this.candles = data
      if (data.length > 0) {
        this.oldestTime = data[0].time
      }
      this.series.setData(this.candles)
      this.chart.timeScale().fitContent()
    } catch (error) {
      console.error("Failed to load candle data:", error)
    }
  }

  subscribeToScroll() {
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return
      if (range.from < 50) {
        this.loadMoreHistory()
      }
    })
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
      this.chart.timeScale().scrollToPosition(scrollPos + filtered.length, false)
    } catch (error) {
      console.error("Failed to load history:", error)
    } finally {
      this.isLoadingHistory = false
    }
  }

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
            controller.series.update(candle)
          })
        }
      }
    )
  }

  connectBitfinexWs() {
    this.bfxReconnect = true
    const key = `trade:${this.timeframeValue}:t${this.symbolValue}`

    const ws = new WebSocket("wss://api-pub.bitfinex.com/ws/2")

    ws.onopen = () => {
      ws.send(JSON.stringify({ event: "subscribe", channel: "candles", key }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      // Skip event messages (info, subscribed, error)
      if (msg.event) return

      // Skip heartbeats
      if (msg[1] === "hb") return

      // Skip snapshots (array of arrays)
      if (Array.isArray(msg[1][0])) return

      // Update: [chanId, [MTS, O, C, H, L, V]]
      const [mts, open, close, high, low, volume] = msg[1]
      const candle = {
        time: Math.floor(mts / 1000),
        open,
        high,
        low,
        close,
        volume
      }
      this.updateCandleCache(candle)
      this.series.update(candle)
    }

    ws.onclose = () => {
      if (this.bfxReconnect) {
        setTimeout(() => this.connectBitfinexWs(), 3000)
      }
    }

    ws.onerror = () => ws.close()

    this.bfxWs = ws
  }

  updateCandleCache(candle) {
    const idx = this.candles.findIndex(c => c.time === candle.time)
    if (idx !== -1) {
      this.candles[idx] = candle
    } else if (this.candles.length === 0 || candle.time > this.candles[this.candles.length - 1].time) {
      this.candles.push(candle)
    }
  }

  observeResize() {
    this.resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      this.chart.applyOptions({ width, height })
    })
    this.resizeObserver.observe(this.element)
  }
}
