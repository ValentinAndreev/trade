import { AllCommunityModule, ModuleRegistry, type GridApi } from "ag-grid-community"
import type { SystemStats, Trade } from "../types/store"
import { EquityChart, type EquityChartType } from "./equity_chart"
import { DEFAULT_EQUITY_COLOR, layoutHTML, setupResizeHandle } from "./layout"
import { renderMetrics } from "./metrics_renderer"
import { renderTradesGrid } from "./trades_grid"

ModuleRegistry.registerModules([AllCommunityModule])

export type StatsPanelState = {
  equityColor: string
  equityType: EquityChartType
}

export function buildDefaultStatsPanelState(): StatsPanelState {
  return {
    equityColor: DEFAULT_EQUITY_COLOR,
    equityType: "line",
  }
}

export class StatsPanel {
  private equityChart: EquityChart | null = null
  private gridApi: GridApi | null = null
  private dragCleanup: (() => void) | null = null
  private equityData: Array<{ time: number; equity: number }> = []

  constructor(
    private container: HTMLElement,
    private state: StatsPanelState,
  ) {}

  render(stats: SystemStats, trades: Trade[]): void {
    this.destroy()

    this.container.innerHTML = layoutHTML(this.state.equityColor, this.state.equityType)
    this.dragCleanup = setupResizeHandle(this.container, null, () => this.equityChart?.resize())

    this.equityData = stats.equityCurve
    this.setupEquityToolbar()
    this.rebuildEquityChart()
    this.renderMetrics(stats)
    this.renderTrades(trades)
  }

  destroy(): void {
    this.dragCleanup?.()
    this.dragCleanup = null
    this.equityChart?.destroy()
    this.equityChart = null
    this.gridApi?.destroy?.()
    this.gridApi = null
  }

  private setupEquityToolbar(): void {
    const toolbar = this.container.querySelector("[data-equity-toolbar]") as HTMLElement | null
    if (!toolbar) return

    toolbar.addEventListener("click", (event: Event) => {
      const btn = (event.target as HTMLElement).closest("[data-chart-type]") as HTMLElement | null
      if (!btn) return
      this.state.equityType = btn.dataset.chartType as EquityChartType
      this.rebuildEquityChart()
      this.updateToolbarActive(toolbar)
    })

    toolbar.addEventListener("input", (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.dataset.field !== "equityColor") return
      this.state.equityColor = input.value
      this.rebuildEquityChart()
    })

    this.updateToolbarActive(toolbar)
  }

  private updateToolbarActive(toolbar: HTMLElement): void {
    for (const btn of toolbar.querySelectorAll<HTMLElement>("[data-chart-type]")) {
      const active = btn.dataset.chartType === this.state.equityType
      btn.classList.toggle("bg-blue-600/30", active)
      btn.classList.toggle("text-blue-300", active)
      btn.classList.toggle("text-gray-400", !active)
    }
  }

  private rebuildEquityChart(): void {
    const chartEl = this.container.querySelector("[data-chart-area]") as HTMLElement | null
    if (!chartEl || !this.equityData.length) return

    this.equityChart?.destroy()
    this.equityChart = new EquityChart(chartEl, this.equityData, this.state.equityColor, this.state.equityType)
    this.equityChart.build()
  }

  private renderMetrics(stats: SystemStats): void {
    const el = this.container.querySelector("[data-metrics]") as HTMLElement | null
    if (!el) return
    renderMetrics(el, stats)
  }

  private renderTrades(trades: Trade[]): void {
    const el = this.container.querySelector("[data-trades]") as HTMLElement | null
    if (!el) return
    this.gridApi = renderTradesGrid(el, trades)
  }
}
