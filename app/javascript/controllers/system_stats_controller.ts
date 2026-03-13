import { Controller } from "@hotwired/stimulus"
import { AllCommunityModule, ModuleRegistry, type GridApi } from "ag-grid-community"
import type { SystemStats, Trade } from "../types/store"
import { ACCENT_COLOR } from "../config/theme"

import { layoutHTML, skeletonHTML, setupResizeHandle } from "../system_stats/layout"
import { renderMetrics }   from "../system_stats/metrics_renderer"
import { renderTradesGrid } from "../system_stats/trades_grid"
import { EquityChart, type EquityChartType } from "../system_stats/equity_chart"

ModuleRegistry.registerModules([AllCommunityModule])

export default class extends Controller {
  static values = {
    systemId:  String,
    dataTabId: String,
  }

  declare systemIdValue:  string
  declare dataTabIdValue: string

  private equityChart:  EquityChart | null = null
  private gridApi:      GridApi | null = null
  private dragCleanup:  (() => void) | null = null

  private _equityData:  Array<{ time: number; equity: number }> = []
  private _equityColor: string = ACCENT_COLOR
  private _equityType:  EquityChartType = "line"

  connect() {
    this.element.innerHTML = skeletonHTML()
    this._requestStats()
  }

  disconnect() {
    this.dragCleanup?.()
    this.equityChart?.destroy()
    this.equityChart = null
  }

  /** Called by tabs_controller after stats are computed. */
  setStats(stats: SystemStats | null, trades: Trade[]) {
    if (!stats) {
      this.element.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm">No data available. Add data to the linked Data tab first.</div>`
      return
    }

    this.element.innerHTML = layoutHTML(this._equityColor, this._equityType)
    this.dragCleanup = setupResizeHandle(this.element, null, () => this.equityChart?.resize())
    this._renderEquityCurve(stats)
    this._renderMetrics(stats)
    this._renderTradeList(trades)
  }

  private _requestStats() {
    this.element.dispatchEvent(new CustomEvent("systemstats:requestStats", {
      bubbles: true,
      detail: { systemId: this.systemIdValue, dataTabId: this.dataTabIdValue },
    }))
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
        this._equityType = btn.dataset.chartType as EquityChartType
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
    for (const btn of this.element.querySelectorAll("[data-chart-type]")) {
      const el = btn as HTMLElement
      const active = el.dataset.chartType === this._equityType
      el.classList.toggle("bg-blue-600/30", active)
      el.classList.toggle("text-blue-300",  active)
      el.classList.toggle("text-gray-400", !active)
    }
  }

  private _rebuildEquityChart() {
    const chartEl = this.element.querySelector("[data-chart-area]") as HTMLElement | null
    if (!chartEl || !this._equityData.length) return
    this.equityChart?.destroy()
    this.equityChart = new EquityChart(chartEl, this._equityData, this._equityColor, this._equityType)
    this.equityChart.build()
  }

  private _renderMetrics(stats: SystemStats) {
    const el = this.element.querySelector("[data-metrics]") as HTMLElement | null
    if (!el) return
    renderMetrics(el, stats)
  }

  private _renderTradeList(trades: Trade[]) {
    const el = this.element.querySelector("[data-trades]") as HTMLElement | null
    if (!el) return
    this.gridApi = renderTradesGrid(el, trades)
  }
}
