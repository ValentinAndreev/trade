import { BG_HOVER } from "../config/theme"
import { StatsPanel, type StatsPanelState } from "../system_stats/stats_panel"
import type { ResearchProgressInfo } from "./progress"
import { formatValue, runSummary } from "./summary"
import { selectedRunPlaceholderHTML } from "./templates"
import type { ProcessedResearchRun } from "./types"

export class SelectedRunView {
  private statsPanel: StatsPanel | null = null

  constructor(
    private container: HTMLElement,
    private panelState: StatsPanelState,
  ) {}

  renderPlaceholder(busy: boolean, progress: ResearchProgressInfo | null = null): void {
    this.destroy()
    this.container.innerHTML = selectedRunPlaceholderHTML(busy, progress)
  }

  render(run: ProcessedResearchRun): void {
    this.destroy()

    this.container.innerHTML = `
      <div class="flex flex-col h-full overflow-hidden">
        <div class="flex-none px-4 py-2 bg-[#141428] border-b border-[${BG_HOVER}] text-sm text-gray-300">
          Selected run: ${runSummary(run)} · Trades ${run.stats.totalTrades} · Net ${formatValue(run.stats.netProfit)} (${formatValue(run.stats.netProfitPercent)}%)
        </div>
        <div class="flex-1 min-h-0 overflow-hidden" data-selected-run-layout></div>
      </div>
    `

    const layoutEl = this.container.querySelector("[data-selected-run-layout]") as HTMLElement | null
    if (!layoutEl) return

    this.statsPanel = new StatsPanel(layoutEl, this.panelState)
    this.statsPanel.render(run.stats, run.trades)
  }

  destroy(): void {
    this.statsPanel?.destroy()
    this.statsPanel = null
  }
}
