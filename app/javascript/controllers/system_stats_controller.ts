import { Controller } from "@hotwired/stimulus"
import { createGrid, type GridApi, themeQuartz, AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { createChart, type IChartApi, type ISeriesApi, LineSeries, AreaSeries, HistogramSeries, BaselineSeries, type LineSeriesOptions, type AreaSeriesOptions, type HistogramSeriesOptions, type BaselineSeriesOptions, type SeriesType } from "lightweight-charts"
import type { SystemStats, Trade } from "../types/store"

ModuleRegistry.registerModules([AllCommunityModule])

const darkTheme = themeQuartz.withParams({
  backgroundColor: "#1a1a2e",
  foregroundColor: "#d1d4dc",
  headerBackgroundColor: "#22223a",
  headerTextColor: "#9ca3af",
  rowHoverColor: "#2a2a3e",
  borderColor: "#3a3a4e",
  accentColor: "#3b82f6",
  chromeBackgroundColor: "#1a1a2e",
  oddRowBackgroundColor: "#1e1e32",
  fontSize: 13,
  headerFontSize: 13,
})

/** Compute column width from header label (same formula as data grid). */
function colWidth(header: string, minWidth = 60): number {
  return Math.max(minWidth, Math.min(300, header.length * 10 + 16))
}

export default class extends Controller {
  static values = {
    systemId: String,
    dataTabId: String,
  }

  declare systemIdValue: string
  declare dataTabIdValue: string

  private chart: IChartApi | null = null
  private equitySeries: ISeriesApi<SeriesType> | null = null
  private gridApi: GridApi | null = null
  private resizeOb: ResizeObserver | null = null
  private _dragCleanup: (() => void) | null = null
  private _equityData: Array<{ time: number; equity: number }> = []
  private _equityColor = "#3b82f6"
  private _equityType: "line" | "area" | "histogram" | "baseline" = "line"

  connect() {
    this.element.innerHTML = this._skeletonHTML()
    this._requestStats()
  }

  disconnect() {
    this.resizeOb?.disconnect()
    this._dragCleanup?.()
    this.chart?.remove()
    this.chart = null
  }

  private _requestStats() {
    this.element.dispatchEvent(new CustomEvent("systemstats:requestStats", {
      bubbles: true,
      detail: { systemId: this.systemIdValue, dataTabId: this.dataTabIdValue },
    }))
  }

  /** Called by tabs_controller after stats are computed. */
  setStats(stats: SystemStats | null, trades: Trade[]) {
    if (!stats) {
      this.element.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm">No data available. Add data to the linked Data tab first.</div>`
      return
    }

    this.element.innerHTML = this._layoutHTML()
    this._setupResizeHandle()
    this._renderEquityCurve(stats)
    this._renderMetrics(stats)
    this._renderTradeList(trades)
  }

  private _renderEquityCurve(stats: SystemStats) {
    this._equityData = stats.equityCurve
    this._setupEquityToolbar()
    this._rebuildEquityChart()
  }

  private _setupEquityToolbar() {
    const toolbar = this.element.querySelector("[data-equity-toolbar]")
    if (!toolbar) return

    toolbar.addEventListener("click", (e: Event) => {
      const btn = (e.target as HTMLElement).closest("[data-chart-type]") as HTMLElement | null
      if (btn) {
        this._equityType = btn.dataset.chartType as typeof this._equityType
        this._rebuildEquityChart()
        this._updateToolbarActive()
      }
    })

    toolbar.addEventListener("input", (e: Event) => {
      const input = e.target as HTMLInputElement
      if (input.dataset.field === "equityColor") {
        this._equityColor = input.value
        this._rebuildEquityChart()
      }
    })

    this._updateToolbarActive()
  }

  private _updateToolbarActive() {
    const btns = this.element.querySelectorAll("[data-chart-type]")
    for (const btn of btns) {
      const el = btn as HTMLElement
      const active = el.dataset.chartType === this._equityType
      el.classList.toggle("bg-blue-600/30", active)
      el.classList.toggle("text-blue-300", active)
      el.classList.toggle("text-gray-400", !active)
    }
  }

  private _rebuildEquityChart() {
    const chartEl = this.element.querySelector("[data-chart-area]") as HTMLElement | null
    if (!chartEl || !this._equityData.length) return

    if (this.chart) {
      this.resizeOb?.disconnect()
      this.chart.remove()
      this.chart = null
      this.equitySeries = null
    }

    this.chart = createChart(chartEl, {
      layout: { background: { color: "#1a1a2e" }, textColor: "#9ca3af" },
      grid: { vertLines: { color: "#2a2a3e" }, horzLines: { color: "#2a2a3e" } },
      width: chartEl.offsetWidth,
      height: chartEl.offsetHeight,
    })

    chartEl.addEventListener("dblclick", () => {
      this.chart?.timeScale().fitContent()
      this.equitySeries?.priceScale().applyOptions({ autoScale: true })
    })

    const color = this._equityColor
    const data = this._equityData.map(p => ({
      time: p.time as import("lightweight-charts").Time,
      value: p.equity,
    }))

    switch (this._equityType) {
      case "area":
        this.equitySeries = this.chart.addSeries(AreaSeries, {
          lineColor: color, topColor: color + "66", bottomColor: color + "0a", lineWidth: 2,
        } as AreaSeriesOptions)
        break
      case "histogram":
        this.equitySeries = this.chart.addSeries(HistogramSeries, {
          color,
        } as HistogramSeriesOptions)
        break
      case "baseline":
        this.equitySeries = this.chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: 0 },
          topLineColor: "#26a69a", topFillColor1: "#26a69a33", topFillColor2: "#26a69a05",
          bottomLineColor: "#ef5350", bottomFillColor1: "#ef535005", bottomFillColor2: "#ef535033",
        } as BaselineSeriesOptions)
        break
      default:
        this.equitySeries = this.chart.addSeries(LineSeries, {
          color, lineWidth: 2,
        } as LineSeriesOptions)
    }

    this.equitySeries.setData(data)
    this.chart.timeScale().fitContent()

    this.resizeOb = new ResizeObserver(() => {
      if (this.chart && chartEl) this.chart.resize(chartEl.offsetWidth, chartEl.offsetHeight)
    })
    this.resizeOb.observe(chartEl)
  }

  private _renderMetrics(stats: SystemStats) {
    const el = this.element.querySelector("[data-metrics]") as HTMLElement | null
    if (!el) return

    const sign = (v: number) => v >= 0 ? "+" : ""
    const pnlColor = (v: number) => v >= 0 ? "text-emerald-400" : "text-red-400"
    const fmt = (v: number, d = 2) => v.toFixed(d)

    const rows: Array<[string, string, string?]> = [
      ["Net profit",        `${sign(stats.netProfit)}${fmt(stats.netProfit)} (${sign(stats.netProfitPercent)}${fmt(stats.netProfitPercent)}%)`, pnlColor(stats.netProfit)],
      ["Win rate",          `${fmt(stats.winRate)}%`],
      ["Total trades",      String(stats.totalTrades)],
      ["Winners / Losers",  `${stats.winningTrades} / ${stats.losingTrades}`],
      ["Profit factor",     fmt(stats.profitFactor, 3)],
      ["Gross profit",      `+${fmt(stats.grossProfit)}`, "text-emerald-400"],
      ["Gross loss",        `-${fmt(stats.grossLoss)}`, "text-red-400"],
      ["Avg win",           `+${fmt(stats.avgWin)} (+${fmt(stats.avgWinPercent)}%)`, "text-emerald-400"],
      ["Avg loss",          `-${fmt(stats.avgLoss)} (-${fmt(stats.avgLossPercent)}%)`, "text-red-400"],
      ["Expectancy",        `${sign(stats.expectancy)}${fmt(stats.expectancy)}`],
      ["Max drawdown",      `-${fmt(stats.maxDrawdown)} (-${fmt(stats.maxDrawdownPercent)}%)`, "text-red-400"],
      ["Sharpe ratio",      fmt(stats.sharpeRatio, 3)],
      ["Sortino ratio",     fmt(stats.sortinoRatio, 3)],
      ["Calmar ratio",      fmt(stats.calmarRatio, 3)],
      ["Recovery factor",   fmt(stats.recoveryFactor, 3)],
      ["Avg bars in trade", fmt(stats.avgBarsInTrade, 1)],
      ["Max consec. wins",  String(stats.maxConsecutiveWins)],
      ["Max consec. losses",String(stats.maxConsecutiveLosses)],
      ["Best trade",        `+${fmt(stats.bestTrade)}`, "text-emerald-400"],
      ["Worst trade",       `${fmt(stats.worstTrade)}`, "text-red-400"],
    ]

    el.innerHTML = rows.map(([label, value, cls = "text-white"]) => `
      <div class="flex justify-between gap-2 py-0.5 border-b border-[#2a2a3e] last:border-0">
        <span class="text-gray-400 text-sm">${label}</span>
        <span class="text-sm font-mono ${cls} text-right">${value}</span>
      </div>`
    ).join("")
  }

  private _renderTradeList(trades: Trade[]) {
    const el = this.element.querySelector("[data-trades]") as HTMLElement | null
    if (!el) return

    const fmt = (v: number) => v.toFixed(2)
    const fmtDate = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ")

    type TradeRow = { idx: number; dir: string; entryTime: string; entryPrice: string; exitTime: string; exitPrice: string; pnl: number | null; pnlPct: number | null; bars: number | null }

    const pnlStyle = (p: { value: number | null }) => (p.value ?? 0) >= 0 ? { color: "#26a69a" } : { color: "#ef5350" }

    const colDefs: import("ag-grid-community").ColDef<TradeRow>[] = [
      { headerName: "#",           field: "idx",        width: colWidth("#", 40),              suppressSizeToFit: true },
      { headerName: "Dir",         field: "dir",        width: colWidth("Dir", 70),             suppressSizeToFit: true },
      { headerName: "Entry time",  field: "entryTime",  width: colWidth("Entry time", 140),     suppressSizeToFit: true },
      { headerName: "Entry price", field: "entryPrice", width: colWidth("Entry price", 100),    suppressSizeToFit: true },
      { headerName: "Exit time",   field: "exitTime",   width: colWidth("Exit time", 140),      suppressSizeToFit: true },
      { headerName: "Exit price",  field: "exitPrice",  width: colWidth("Exit price", 100),     suppressSizeToFit: true },
      { headerName: "P&L",   field: "pnl",    width: colWidth("P&L", 90),    suppressSizeToFit: true, cellStyle: pnlStyle },
      { headerName: "P&L %", field: "pnlPct", width: colWidth("P&L %", 80),  suppressSizeToFit: true, cellStyle: pnlStyle },
      { headerName: "Bars",  field: "bars",   width: colWidth("Bars", 60),   suppressSizeToFit: true },
    ]
    const rowData = trades
      .filter(t => t.exitTime != null)
      .map((t, i) => ({
        idx: i + 1,
        dir: t.direction === "long" ? "▲ Long" : "▼ Short",
        entryTime: fmtDate(t.entryTime),
        entryPrice: fmt(t.entryPrice),
        exitTime: t.exitTime ? fmtDate(t.exitTime) : "—",
        exitPrice: t.exitPrice != null ? fmt(t.exitPrice) : "—",
        pnl: t.pnl != null ? +t.pnl.toFixed(4) : null,
        pnlPct: t.pnlPercent != null ? +t.pnlPercent.toFixed(2) : null,
        bars: t.bars,
      }))

    this.gridApi = createGrid(el, {
      theme: darkTheme,
      columnDefs: colDefs,
      rowData,
      defaultColDef: { resizable: true, sortable: true },
      domLayout: "normal",
      onFirstDataRendered: (params) => {
        params.api.autoSizeAllColumns(false)
      },
    })
  }

  private _setupResizeHandle() {
    const handle = this.element.querySelector("[data-resize-handle]") as HTMLElement | null
    const chartArea = this.element.querySelector("[data-chart-area]") as HTMLElement | null
    if (!handle || !chartArea) return

    let startY = 0
    let startH = 0

    const onMove = (e: MouseEvent) => {
      const delta = e.clientY - startY
      const newH = Math.max(80, Math.min(startH + delta, window.innerHeight * 0.75))
      chartArea.style.height = `${newH}px`
      this.chart?.resize(chartArea.offsetWidth, chartArea.offsetHeight)
    }

    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    const onDown = (e: MouseEvent) => {
      startY = e.clientY
      startH = chartArea.offsetHeight
      document.body.style.userSelect = "none"
      document.body.style.cursor = "row-resize"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    }

    handle.addEventListener("mousedown", onDown)
    this._dragCleanup = () => {
      handle.removeEventListener("mousedown", onDown)
      onUp()
    }
  }

  private _skeletonHTML(): string {
    return `<div class="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">Loading statistics…</div>`
  }

  private _layoutHTML(): string {
    const typeBtns = (["line", "area", "histogram", "baseline"] as const).map(t => {
      const labels: Record<string, string> = { line: "Line", area: "Area", histogram: "Bars", baseline: "±Zero" }
      return `<button data-chart-type="${t}"
                      class="px-2 py-0.5 text-xs rounded cursor-pointer hover:bg-[#3a3a4e] transition-colors">${labels[t]}</button>`
    }).join("")

    return `
      <div class="flex flex-col h-full w-full overflow-hidden text-white">
        <div data-equity-toolbar class="flex-none flex items-center gap-2 px-3 py-1.5 bg-[#1a1a2e] border-b border-[#2a2a3e]">
          <span class="text-xs text-gray-500 uppercase tracking-wide">Equity</span>
          <div class="flex gap-1">${typeBtns}</div>
          <input type="color" data-field="equityColor" value="${this._equityColor}"
                 class="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 ml-1 shrink-0"
                 title="Chart color">
        </div>
        <div data-chart-area class="flex-none w-full" style="height:500px; min-height:80px"></div>
        <div data-resize-handle
             class="flex-none h-1.5 w-full bg-[#2a2a3e] hover:bg-blue-500 cursor-row-resize transition-colors shrink-0"></div>
        <div class="flex flex-row flex-1 min-h-0 overflow-hidden w-full">
          <div class="flex-none w-[27rem] overflow-y-auto p-4 border-r border-[#2a2a3e]" data-metrics></div>
          <div class="flex-1 min-w-0" data-trades></div>
        </div>
      </div>`
  }
}
