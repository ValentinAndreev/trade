import { Controller } from "@hotwired/stimulus"
import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts"

import { CHART_THEME, CANDLE_STYLE } from "../chart/theme"
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
    // Wrapper: flex column with chart + scrollbar
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

    this.series = this.chart.addSeries(CandlestickSeries, CANDLE_STYLE)

    // Volume in a separate pane (pane index 1)
    this.volumePane = this.chart.addPane()
    this.volumeSeries = this.chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" } },
      1,
    )

    this.applyVolumeLayout()

    // Hide volume pane if saved as hidden
    if (!this.volumeVisible) {
      this.collapseVolumePane()
    }

    // Scrollbar below the chart
    this.scrollbar = new Scrollbar(this.element, {
      getVisibleRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      setVisibleRange: (range) => this.chart.timeScale().setVisibleLogicalRange(range),
      getTotalBars: () => this.loader.candles.length,
    })

    // Feeds
    const onCandle = (candle) => this.handleCandle(candle)
    this.bfxFeed = new BitfinexFeed(this.symbolValue, this.timeframeValue, onCandle)
    this.cableFeed = new CableFeed(this.symbolValue, this.timeframeValue, onCandle)
  }

  applyVolumeLayout() {
    const panes = this.chart.panes()
    if (panes.length < 2) return
    panes[0].setStretchFactor(1 - this.volumeRatio)
    panes[1].setStretchFactor(this.volumeRatio)
  }

  collapseVolumePane() {
    const panes = this.chart.panes()
    if (panes.length < 2) return
    panes[0].setStretchFactor(1)
    panes[1].setStretchFactor(0)
  }

  handleCandle(candle) {
    this.loader.updateCandle(candle)
    try { this.series.update(candle) } catch (e) { console.log("[chart] update skipped:", e.message) }
    try { this.volumeSeries.update(toVolumePoint(candle)) } catch { /* skip */ }
  }

  // --- Data ---

  async loadData() {
    try {
      const candles = await this.loader.loadInitial()
      this.series.setData(candles)
      this.volumeSeries.setData(toVolumeData(candles))
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

    this.series.setData(this.loader.candles)
    this.volumeSeries.setData(toVolumeData(this.loader.candles))
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
