import { AllCommunityModule, ModuleRegistry, type GridApi } from "ag-grid-community"
import { BG_HOVER, BG_SURFACE } from "../config/theme"
import { renderMetrics } from "../system_stats/metrics_renderer"
import { renderTradesGrid } from "../system_stats/trades_grid"
import type { ResearchProgressInfo } from "./progress"
import { formatValue, runSummary } from "./summary"
import { selectedRunPlaceholderHTML } from "./templates"
import type { ProcessedResearchRun } from "./types"

ModuleRegistry.registerModules([AllCommunityModule])

export class SelectedRunView {
  private tradesGridApi: GridApi | null = null

  constructor(private container: HTMLElement) {}

  renderPlaceholder(busy: boolean, progress: ResearchProgressInfo | null = null): void {
    this.destroy()
    this.container.innerHTML = selectedRunPlaceholderHTML(busy, progress)
  }

  render(run: ProcessedResearchRun): void {
    this.destroy()

    this.container.innerHTML = `
      <div class="flex flex-col h-full overflow-hidden">
        <div class="flex-none px-4 py-2 bg-[${BG_SURFACE}] border-b border-[${BG_HOVER}] text-sm text-gray-300">
          Selected run: ${runSummary(run)} · Trades ${run.stats.totalTrades} · Net ${formatValue(run.stats.netProfit)} (${formatValue(run.stats.netProfitPercent)}%)
        </div>
        <div class="flex-1 min-h-0 overflow-hidden flex">
          <div class="flex-none w-[27rem] overflow-y-auto p-4 border-r border-[${BG_HOVER}]" data-selected-run-metrics></div>
          <div class="flex-1 min-w-0" data-selected-run-trades></div>
        </div>
      </div>
    `

    const metricsEl = this.container.querySelector("[data-selected-run-metrics]") as HTMLElement | null
    const tradesEl = this.container.querySelector("[data-selected-run-trades]") as HTMLElement | null
    if (metricsEl) renderMetrics(metricsEl, run.stats)
    if (tradesEl) this.tradesGridApi = renderTradesGrid(tradesEl, run.trades)
  }

  destroy(): void {
    this.tradesGridApi?.destroy?.()
    this.tradesGridApi = null
  }
}
