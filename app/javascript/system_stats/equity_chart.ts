import {
  createChart, type IChartApi, type ISeriesApi, type SeriesType,
  LineSeries, AreaSeries, HistogramSeries, BaselineSeries,
  type LineSeriesOptions, type AreaSeriesOptions, type HistogramSeriesOptions, type BaselineSeriesOptions,
} from "lightweight-charts"
import { BG_PRIMARY, BG_HOVER, UP_COLOR, DOWN_COLOR } from "../config/theme"

export type EquityChartType = "line" | "area" | "histogram" | "baseline"

export class EquityChart {
  private chart:         IChartApi | null = null
  private series:        ISeriesApi<SeriesType> | null = null
  private resizeOb:      ResizeObserver | null = null

  constructor(
    private el: HTMLElement,
    private data: Array<{ time: number; equity: number }>,
    private color: string,
    private type: EquityChartType,
  ) {}

  build(): void {
    this.destroy()

    this.chart = createChart(this.el, {
      layout: { background: { color: BG_PRIMARY }, textColor: "#9ca3af" },
      grid:   { vertLines: { color: BG_HOVER }, horzLines: { color: BG_HOVER } },
      width:  this.el.offsetWidth,
      height: this.el.offsetHeight,
    })

    this.el.addEventListener("dblclick", () => {
      this.chart?.timeScale().fitContent()
      this.series?.priceScale().applyOptions({ autoScale: true })
    })

    this._addSeries()

    const chartData = this.data.map(p => ({
      time: p.time as import("lightweight-charts").Time,
      value: p.equity,
    }))
    this.series!.setData(chartData)
    this.chart.timeScale().fitContent()

    this.resizeOb = new ResizeObserver(() => {
      if (this.chart) this.chart.resize(this.el.offsetWidth, this.el.offsetHeight)
    })
    this.resizeOb.observe(this.el)
  }

  destroy(): void {
    this.resizeOb?.disconnect()
    this.resizeOb = null
    this.chart?.remove()
    this.chart  = null
    this.series = null
  }

  resize(): void {
    if (this.chart) this.chart.resize(this.el.offsetWidth, this.el.offsetHeight)
  }

  private _addSeries(): void {
    const c = this.color
    switch (this.type) {
      case "area":
        this.series = this.chart!.addSeries(AreaSeries, {
          lineColor: c, topColor: c + "66", bottomColor: c + "0a", lineWidth: 2,
        } as AreaSeriesOptions)
        break
      case "histogram":
        this.series = this.chart!.addSeries(HistogramSeries, { color: c } as HistogramSeriesOptions)
        break
      case "baseline":
        this.series = this.chart!.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: 0 },
          topLineColor: UP_COLOR,    topFillColor1: UP_COLOR + "33",    topFillColor2: UP_COLOR + "05",
          bottomLineColor: DOWN_COLOR, bottomFillColor1: DOWN_COLOR + "05", bottomFillColor2: DOWN_COLOR + "33",
        } as BaselineSeriesOptions)
        break
      default:
        this.series = this.chart!.addSeries(LineSeries, { color: c, lineWidth: 2 } as LineSeriesOptions)
    }
  }
}
