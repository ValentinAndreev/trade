import { Controller } from "@hotwired/stimulus"
import { createChart } from "lightweight-charts"

import { CHART_THEME, PRICE_SERIES_TYPES, VOLUME_SERIES_TYPES } from "../chart/theme"
import { toVolumePoint, toVolumeData } from "../chart/volume"
import DataLoader from "../chart/data_loader"
import BitfinexFeed from "../chart/bitfinex_feed"
import CableFeed from "../chart/cable_feed"
import Scrollbar from "../chart/scrollbar"

export default class extends Controller {
  static values = {
    symbol: { type: String, default: "" },
    timeframe: { type: String, default: "1m" },
    url: String,
  }

  connect() {
    if (!this.symbolValue) return

    this.mode = "price"
    this.priceType = "Candlestick"
    this.volumeType = "Histogram"
    this.loader = new DataLoader(this.urlValue)

    this.initChart()

    this.loadData().then(() => {
      this.subscribeToScroll()
      this.bfxFeed.connect()
    })
    this.cableFeed.connect()
  }

  disconnect() {
    this.bfxFeed?.disconnect()
    this.cableFeed?.disconnect()
    if (this.scrollHandler) {
      this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.scrollHandler)
    }
    this.scrollbar?.destroy()
    this.chart?.remove()
    this.chartWrapperEl?.remove()
  }

  // --- Chart ---

  initChart() {
    Object.assign(this.element.style, {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    })

    this.chartWrapperEl = document.createElement("div")
    Object.assign(this.chartWrapperEl.style, { flex: "1", minHeight: "0" })
    this.element.appendChild(this.chartWrapperEl)

    this.chart = createChart(this.chartWrapperEl, {
      ...CHART_THEME,
      autoSize: true,
      timeScale: { timeVisible: true, secondsVisible: false },
    })

    this.createSeries()

    this.scrollbar = new Scrollbar(this.element, {
      getVisibleRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      setVisibleRange: (range) => this.chart.timeScale().setVisibleLogicalRange(range),
      getTotalBars: () => this.loader.candles.length,
    })

    const onCandle = (candle) => this.handleCandle(candle)
    this.bfxFeed = new BitfinexFeed(this.symbolValue, this.timeframeValue, onCandle)
    this.cableFeed = new CableFeed(this.symbolValue, this.timeframeValue, onCandle)
  }

  // --- Series creation ---

  createSeries() {
    if (this.mode === "volume") {
      const def = VOLUME_SERIES_TYPES[this.volumeType]
      this.series = this.chart.addSeries(def.type, def.options)
    } else {
      const def = PRICE_SERIES_TYPES[this.priceType]
      this.series = this.chart.addSeries(def.type, def.options)
    }
  }

  // --- Data formatting ---

  toSeriesData(candles) {
    if (this.mode === "volume") {
      return this._toVolumeSeriesData(candles)
    }
    return this._toPriceData(candles)
  }

  toUpdatePoint(candle) {
    if (this.mode === "volume") {
      return this._toVolumeUpdatePoint(candle)
    }
    return this._toPriceUpdatePoint(candle)
  }

  _toPriceData(candles) {
    if (this.priceType === "Candlestick" || this.priceType === "Bar") {
      return candles
    }
    return candles.map(c => ({ time: c.time, value: c.close }))
  }

  _toPriceUpdatePoint(candle) {
    if (this.priceType === "Candlestick" || this.priceType === "Bar") {
      return candle
    }
    return { time: candle.time, value: candle.close }
  }

  _toVolumeSeriesData(candles) {
    if (this.volumeType === "Histogram") {
      return toVolumeData(candles)
    }
    return candles.map(c => ({ time: c.time, value: c.volume || 0 }))
  }

  _toVolumeUpdatePoint(candle) {
    if (this.volumeType === "Histogram") {
      return toVolumePoint(candle)
    }
    return { time: candle.time, value: candle.volume || 0 }
  }

  // --- Mode switching ---

  showMode(mode) {
    if (mode === this.mode) return
    this.mode = mode
    this.chart.removeSeries(this.series)
    this.createSeries()
    if (this.loader.candles.length > 0) {
      this.series.setData(this.toSeriesData(this.loader.candles))
    }
  }

  // --- Switch series type ---

  switchPriceType(type) {
    if (type === this.priceType || !PRICE_SERIES_TYPES[type]) return
    this.priceType = type
    if (this.mode === "price") {
      this.chart.removeSeries(this.series)
      this.createSeries()
      if (this.loader.candles.length > 0) {
        this.series.setData(this.toSeriesData(this.loader.candles))
      }
    }
  }

  switchVolumeType(type) {
    if (type === this.volumeType || !VOLUME_SERIES_TYPES[type]) return
    this.volumeType = type
    if (this.mode === "volume") {
      this.chart.removeSeries(this.series)
      this.createSeries()
      if (this.loader.candles.length > 0) {
        this.series.setData(this.toSeriesData(this.loader.candles))
      }
    }
  }

  // --- Realtime ---

  handleCandle(candle) {
    this.loader.updateCandle(candle)
    try { this.series.update(this.toUpdatePoint(candle)) } catch (e) { console.log("[chart] update skipped:", e.message) }
  }

  // --- Data ---

  async loadData() {
    try {
      const candles = await this.loader.loadInitial()
      this.series.setData(this.toSeriesData(candles))
      this.chart.timeScale().fitContent()
      requestAnimationFrame(() => this.scrollbar.update())
    } catch (error) {
      console.error("Failed to load candle data:", error)
    }
  }

  subscribeToScroll() {
    this.scrollHandler = (range) => {
      if (!range) return
      this.scrollbar.update()
      if (range.from < 50) this.loadMoreHistory()
    }
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.scrollHandler)

    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (range && range.from < 50) this.loadMoreHistory()
  }

  async loadMoreHistory() {
    const scrollPos = this.chart.timeScale().scrollPosition()
    const filtered = await this.loader.loadMoreHistory()
    if (!filtered) return

    this.series.setData(this.toSeriesData(this.loader.candles))
    this.chart.timeScale().scrollToPosition(scrollPos + filtered.length, false)
  }
}
