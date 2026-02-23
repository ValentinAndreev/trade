import { Controller } from "@hotwired/stimulus"
import { createChart } from "lightweight-charts"

import { CHART_THEME, PRICE_SERIES_TYPES, VOLUME_SERIES_TYPES } from "../chart/theme"
import { toVolumePoint, toVolumeData } from "../chart/volume"
import { loadVolumeVisible, saveVolumeVisible, loadVolumeRatio } from "../chart/preferences"
import DataLoader from "../chart/data_loader"
import BitfinexFeed from "../chart/bitfinex_feed"
import CableFeed from "../chart/cable_feed"
import Scrollbar from "../chart/scrollbar"

export default class extends Controller {
  static values = {
    symbol: { type: String, default: "BTCUSD" },
    timeframe: { type: String, default: "1m" },
    url: String,
  }

  connect() {
    this.volumeVisible = loadVolumeVisible()
    this.volumeRatio = loadVolumeRatio()
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
    this.bfxFeed.disconnect()
    this.cableFeed.disconnect()
    if (this.scrollHandler) {
      this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.scrollHandler)
    }
    this.scrollbar.destroy()
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
      layout: {
        ...CHART_THEME.layout,
        panes: {
          separatorColor: "#5a5a7e",
          separatorHoverColor: "#7a7aae",
          enableResize: true,
        },
      },
    })

    // Keep panes alive when series are removed for type switching
    this.chart.panes()[0].setPreserveEmptyPane(true)

    this.createPriceSeries()

    this.volumePane = this.chart.addPane(true)
    this.createVolumeSeries()

    this.applyVolumeLayout()
    if (!this.volumeVisible) this.collapseVolumePane()

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

  createPriceSeries() {
    const def = PRICE_SERIES_TYPES[this.priceType]
    this.series = this.chart.addSeries(def.type, def.options, 0)
  }

  createVolumeSeries() {
    const def = VOLUME_SERIES_TYPES[this.volumeType]
    this.volumeSeries = this.chart.addSeries(def.type, def.options, 1)
  }

  toPriceData(candles) {
    const type = this.priceType
    if (type === "Candlestick" || type === "Bar") {
      return candles
    }
    // Line, Area, Baseline — need { time, value }
    return candles.map(c => ({ time: c.time, value: c.close }))
  }

  toVolumeSeriesData(candles) {
    const type = this.volumeType
    if (type === "Histogram") {
      return toVolumeData(candles)
    }
    // Line, Area — need { time, value }
    return candles.map(c => ({ time: c.time, value: c.volume || 0 }))
  }

  toVolumeUpdatePoint(candle) {
    if (this.volumeType === "Histogram") {
      return toVolumePoint(candle)
    }
    return { time: candle.time, value: candle.volume || 0 }
  }

  toPriceUpdatePoint(candle) {
    if (this.priceType === "Candlestick" || this.priceType === "Bar") {
      return candle
    }
    return { time: candle.time, value: candle.close }
  }

  // --- Switch series type ---

  switchPriceType(type) {
    if (type === this.priceType || !PRICE_SERIES_TYPES[type]) return
    const factors = this.savePaneFactors()
    this.chart.removeSeries(this.series)
    this.priceType = type
    this.createPriceSeries()
    this.restorePaneFactors(factors)
    if (this.loader.candles.length > 0) {
      this.series.setData(this.toPriceData(this.loader.candles))
    }
  }

  switchVolumeType(type) {
    if (type === this.volumeType || !VOLUME_SERIES_TYPES[type]) return
    const factors = this.savePaneFactors()
    this.chart.removeSeries(this.volumeSeries)
    this.volumeType = type
    this.createVolumeSeries()
    this.restorePaneFactors(factors)
    if (this.loader.candles.length > 0) {
      this.volumeSeries.setData(this.toVolumeSeriesData(this.loader.candles))
    }
  }

  // --- Layout ---

  applyVolumeLayout() {
    const panes = this.chart.panes()
    if (panes.length < 2) return
    panes[0].setStretchFactor(1 - this.volumeRatio)
    panes[1].setStretchFactor(this.volumeRatio)
  }

  savePaneFactors() {
    return this.chart.panes().map(p => p.getStretchFactor())
  }

  restorePaneFactors(factors) {
    const panes = this.chart.panes()
    factors.forEach((f, i) => { if (panes[i]) panes[i].setStretchFactor(f) })
  }

  collapseVolumePane() {
    const panes = this.chart.panes()
    if (panes.length < 2) return
    panes[0].setStretchFactor(1)
    panes[1].setStretchFactor(0)
  }

  // --- Realtime ---

  handleCandle(candle) {
    this.loader.updateCandle(candle)
    try { this.series.update(this.toPriceUpdatePoint(candle)) } catch (e) { console.log("[chart] update skipped:", e.message) }
    try { this.volumeSeries.update(this.toVolumeUpdatePoint(candle)) } catch { /* skip */ }
  }

  // --- Data ---

  async loadData() {
    try {
      const candles = await this.loader.loadInitial()
      this.series.setData(this.toPriceData(candles))
      this.volumeSeries.setData(this.toVolumeSeriesData(candles))
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

    this.series.setData(this.toPriceData(this.loader.candles))
    this.volumeSeries.setData(this.toVolumeSeriesData(this.loader.candles))
    this.chart.timeScale().scrollToPosition(scrollPos + filtered.length, false)
  }

  // --- Volume toggle ---

  toggleVolume() {
    this.volumeVisible = !this.volumeVisible
    if (this.volumeVisible) {
      this.applyVolumeLayout()
    } else {
      this.collapseVolumePane()
    }
    saveVolumeVisible(this.volumeVisible)
  }
}
