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
    this.initChart()
    this.loadData()
    this.connectCable()
    this.observeResize()
  }

  disconnect() {
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
      this.series.setData(data)
      this.chart.timeScale().scrollToRealTime()
    } catch (error) {
      console.error("Failed to load candle data:", error)
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
        received(data) {
          controller.series.update(data)
        }
      }
    )
  }

  observeResize() {
    this.resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      this.chart.applyOptions({ width, height })
    })
    this.resizeObserver.observe(this.element)
  }
}
