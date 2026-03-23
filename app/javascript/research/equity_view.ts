import { BG_HOVER, BG_PRIMARY, BG_SURFACE } from "../config/theme"
import { EquityChart, type EquityChartType } from "../system_stats/equity_chart"
import type { StatsPanelState } from "../system_stats/stats_panel"
import type { SystemStats } from "../types/store"

export class ResearchEquityView {
  private equityChart: EquityChart | null = null
  private equityData: Array<{ time: number; equity: number }> = []

  constructor(
    private container: HTMLElement,
    private state: StatsPanelState,
  ) {}

  render(stats: SystemStats): void {
    this.destroy()
    this.equityData = stats.equityCurve

    this.container.innerHTML = `
      <div class="flex flex-col h-full overflow-hidden rounded border border-[${BG_HOVER}] bg-[${BG_PRIMARY}]">
        <div data-equity-toolbar class="flex-none flex items-center gap-2 px-3 py-2 bg-[${BG_SURFACE}] border-b border-[${BG_HOVER}]">
          <span class="text-xs text-gray-500 uppercase tracking-wide">Equity</span>
          <div class="flex gap-1">${chartTypeButtonsHTML()}</div>
          <input
            type="color"
            data-field="equityColor"
            value="${this.state.equityColor}"
            class="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 ml-1 shrink-0"
            title="Chart color"
          >
        </div>
        <div data-chart-area class="flex-1 min-h-[14rem]"></div>
      </div>
    `

    this._setupToolbar()
    this._rebuildEquityChart()
  }

  destroy(): void {
    this.equityChart?.destroy()
    this.equityChart = null
  }

  private _setupToolbar(): void {
    const toolbar = this.container.querySelector("[data-equity-toolbar]") as HTMLElement | null
    if (!toolbar) return

    toolbar.addEventListener("click", (event: Event) => {
      const btn = (event.target as HTMLElement).closest("[data-chart-type]") as HTMLElement | null
      if (!btn) return
      this.state.equityType = btn.dataset.chartType as EquityChartType
      this._rebuildEquityChart()
      this._updateToolbarActive(toolbar)
    })

    toolbar.addEventListener("input", (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.dataset.field !== "equityColor") return
      this.state.equityColor = input.value
      this._rebuildEquityChart()
    })

    this._updateToolbarActive(toolbar)
  }

  private _updateToolbarActive(toolbar: HTMLElement): void {
    for (const btn of toolbar.querySelectorAll<HTMLElement>("[data-chart-type]")) {
      const active = btn.dataset.chartType === this.state.equityType
      btn.classList.toggle("bg-blue-600/30", active)
      btn.classList.toggle("text-blue-300", active)
      btn.classList.toggle("text-gray-400", !active)
    }
  }

  private _rebuildEquityChart(): void {
    const chartEl = this.container.querySelector("[data-chart-area]") as HTMLElement | null
    if (!chartEl) return

    if (!this.equityData.length) {
      chartEl.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">No equity data.</div>`
      return
    }

    this.equityChart?.destroy()
    this.equityChart = new EquityChart(chartEl, this.equityData, this.state.equityColor, this.state.equityType)
    this.equityChart.build()
  }
}

function chartTypeButtonsHTML(): string {
  return (["line", "area", "histogram", "baseline"] as const).map(type => {
    const labels: Record<string, string> = { line: "Line", area: "Area", histogram: "Bars", baseline: "±Zero" }
    return `
      <button
        type="button"
        data-chart-type="${type}"
        class="px-2 py-0.5 text-xs rounded cursor-pointer hover:bg-[#2a2a3e] transition-colors"
      >${labels[type]}</button>
    `
  }).join("")
}
