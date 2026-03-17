import { Controller } from "@hotwired/stimulus"
import { fetchConfig, type AppConfig } from "../tabs/config"
import { showToast } from "../services/toast"
import type { ProcessedResearchRun } from "../research/types"
import { OptimizationChart } from "../research/optimization_chart"
import { renderRunsGrid, type RunsGridView } from "../research/runs_grid"
import {
  metricLabel,
  optimizationTargetLabel,
} from "../research/catalog"
import { runResearch } from "../research/request"
import { serializeResearchResult } from "../research/results"
import { buildResearchProgressInfo } from "../research/progress"
import {
  buildResearchRunId,
  ResearchProgressSubscription,
  type ResearchProgressSnapshot,
} from "../research/progress_subscription"
import { SelectedRunView } from "../research/selected_run_view"
import {
  hydrateResearchState,
  type ResearchState,
} from "../research/state"
import { metricValue, optimizationParamKey, optimizationParamValue } from "../research/summary"
import { renderResearchHTML } from "../research/templates"
import { buildDefaultStatsPanelState } from "../system_stats/stats_panel"

export default class extends Controller {
  static values = {
    tabId: String,
    config: String,
  }

  declare tabIdValue: string
  declare configValue: string

  private config: AppConfig | null = null
  private runs: ProcessedResearchRun[] = []
  private state: ResearchState | null = null
  private selectedRunIndex = 0
  private busy = false
  private busyStartedAt: number | null = null
  private busyElapsedSeconds = 0
  private busyTimer: ReturnType<typeof setInterval> | null = null
  private serverProgress: ResearchProgressSnapshot | null = null
  private progressSubscription: ResearchProgressSubscription | null = null
  private splitCleanup: (() => void) | null = null
  private optimizationChart: OptimizationChart | null = null
  private runsGridView: RunsGridView | null = null
  private selectedRunView: SelectedRunView | null = null
  private statsPanelState = buildDefaultStatsPanelState()

  async connect() {
    this.element.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">Loading research…</div>`
    this.config = await fetchConfig()
    this.state = hydrateResearchState(this.config, this._storedConfig())
    this._persistState()
    this._renderSafely()
  }

  disconnect() {
    this._stopBusyTimer()
    this._disconnectProgressSubscription()
    this._destroyResultsSplit()
    this._destroyOptimizationViews()
    this._destroySelectedRunView()
  }

  async run(nextState?: ResearchState) {
    if (nextState) this.state = { ...nextState }
    if (!this.state) return

    const runId = buildResearchRunId()
    this.busy = true
    this.runs = []
    this.selectedRunIndex = 0
    this.busyStartedAt = Date.now()
    this.busyElapsedSeconds = 0
    this.serverProgress = null
    this._disconnectProgressSubscription()
    this._persistResult()
    this.progressSubscription = new ResearchProgressSubscription(runId, (snapshot) => {
      this.serverProgress = snapshot
      this._renderSafely()
    })
    await this.progressSubscription.connect()
    this._startBusyTimer()
    this._renderSafely()

    try {
      const runs = await runResearch(this.state, runId)
      this.runs = runs || []
      this.selectedRunIndex = 0
      this._persistResult()
    } catch (error) {
      console.error("[Research] Run failed:", error)
      showToast("Research run failed")
    } finally {
      this.busy = false
      this._stopBusyTimer()
      this.serverProgress = null
      this._disconnectProgressSubscription()
      this._renderSafely()
    }
  }

  private _render() {
    if (!this.state || !this.config) return

    this._destroyResultsSplit()
    this._destroyOptimizationViews()
    this._destroySelectedRunView()

    this.element.innerHTML = renderResearchHTML({
      state: this.state,
      busy: this.busy,
      runsCount: this.runs.length,
      progress: this.busy ? buildResearchProgressInfo(this.state, this.busyElapsedSeconds, this.serverProgress) : null,
    })

    this._renderSelectedRun()
    this._renderOptimizationViewsSafely()
    this._setupResultsSplit()
  }

  private _renderOptimizationViewsSafely() {
    try {
      this._renderOptimizationViews()
    } catch (error) {
      console.error("[Research] Optimization views render failed:", error)
      const chartEl = this.element.querySelector("[data-optimization-chart]") as HTMLElement | null
      const gridEl = this.element.querySelector("[data-runs-grid]") as HTMLElement | null
      if (chartEl) {
        chartEl.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">Optimization chart failed to render.</div>`
      }
      if (gridEl && !gridEl.innerHTML.trim()) {
        gridEl.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">Optimization table is unavailable.</div>`
      }
      showToast("Optimization chart render failed")
    }
  }

  private _renderOptimizationViews() {
    this._destroyOptimizationViews()
    if (!this.state || this.runs.length <= 1) return

    const chartEl = this.element.querySelector("[data-optimization-chart]") as HTMLElement | null
    const gridEl = this.element.querySelector("[data-runs-grid]") as HTMLElement | null
    if (!chartEl || !gridEl) return

    this.optimizationChart = new OptimizationChart(
      chartEl,
      this.runs.map((run, index) => ({
        index,
        x: optimizationParamValue(run, this.state.optimizationTarget),
        y: metricValue(run.stats, this.state.selectedMetric),
      })),
      this.selectedRunIndex,
      optimizationTargetLabel(this.state.optimizationTarget),
      metricLabel(this.state.selectedMetric),
      (index: number) => this._selectRun(index)
    )
    this.optimizationChart.build()

    this.runsGridView = renderRunsGrid(
      gridEl,
      this.runs,
      this.selectedRunIndex,
      optimizationParamKey(this.state.optimizationTarget),
      optimizationTargetLabel(this.state.optimizationTarget),
      (index: number) => this._selectRun(index)
    )
  }

  private _renderSelectedRun() {
    if (!this.state) return

    const container = this.element.querySelector("[data-selected-run]") as HTMLElement | null
    if (!container) return

    this._destroySelectedRunView()
    this.selectedRunView = new SelectedRunView(container, this.statsPanelState)

    if (this.busy) {
      this.selectedRunView.renderPlaceholder(
        true,
        buildResearchProgressInfo(this.state, this.busyElapsedSeconds, this.serverProgress)
      )
      return
    }

    const run = this.runs[this.selectedRunIndex]
    if (!run) {
      this.selectedRunView.renderPlaceholder(false, null)
      return
    }

    this.selectedRunView.render(run)
  }

  private _selectRun(index: number) {
    if (index < 0 || index >= this.runs.length) return
    if (index === this.selectedRunIndex) return
    this.selectedRunIndex = index
    this._persistResult()
    this._renderSelectedRun()
    this.optimizationChart?.setSelectedIndex(index)
    this.runsGridView?.setSelectedIndex(index)
  }

  private _destroySelectedRunView() {
    this.selectedRunView?.destroy()
    this.selectedRunView = null
  }

  private _disconnectProgressSubscription() {
    this.progressSubscription?.disconnect()
    this.progressSubscription = null
  }

  private _destroyOptimizationViews() {
    this.optimizationChart?.destroy()
    this.optimizationChart = null
    this.runsGridView?.destroy()
    this.runsGridView = null
  }

  private _startBusyTimer() {
    this._stopBusyTimer()
    this.busyTimer = window.setInterval(() => {
      if (!this.busyStartedAt) return
      this.busyElapsedSeconds = Math.floor((Date.now() - this.busyStartedAt) / 1000)
      if (this.busy) this._renderSafely()
    }, 1000)
  }

  private _stopBusyTimer() {
    if (this.busyTimer) {
      clearInterval(this.busyTimer)
      this.busyTimer = null
    }
    this.busyStartedAt = null
    this.busyElapsedSeconds = 0
  }

  configValueChanged() {
    if (!this.config) return
    const next = hydrateResearchState(this.config, this._storedConfig())
    if (JSON.stringify(this.state) === JSON.stringify(next)) return
    this.state = next
    this._renderSafely()
  }

  private _storedConfig(): Partial<ResearchState> | null {
    if (!this.configValue) return null
    try {
      return JSON.parse(this.configValue) as Partial<ResearchState>
    } catch {
      return null
    }
  }

  private _persistState() {
    if (!this.state) return
    this.element.dispatchEvent(new CustomEvent("research:configChanged", {
      bubbles: true,
      detail: {
        tabId: this.tabIdValue,
        config: { ...this.state },
      },
    }))
  }

  private _persistResult() {
    this.element.dispatchEvent(new CustomEvent("research:resultChanged", {
      bubbles: true,
      detail: {
        tabId: this.tabIdValue,
        result: serializeResearchResult(this.runs, this.selectedRunIndex),
      },
    }))
  }

  private _renderSafely() {
    try {
      this._render()
    } catch (error) {
      console.error("[Research] Render failed:", error)
      this.element.innerHTML = `<div class="flex items-center justify-center h-full text-red-300 text-sm px-6 text-center">Research UI render failed. Check console for details.</div>`
      showToast("Research UI render failed")
    }
  }

  private _setupResultsSplit() {
    if (!this.state || this.runs.length <= 1) return

    const root = this.element.querySelector("[data-research-results-root]") as HTMLElement | null
    const pane = this.element.querySelector("[data-optimization-pane]") as HTMLElement | null
    const handle = this.element.querySelector("[data-research-split-handle]") as HTMLElement | null
    if (!root || !pane || !handle) return

    const totalHeight = root.clientHeight - handle.offsetHeight
    if (totalHeight > 0) {
      pane.style.height = `${Math.round(totalHeight * this.state.resultsSplitRatio)}px`
    }

    let startY = 0
    let startHeight = 0

    const onMove = (event: MouseEvent) => {
      const totalHeight = root.clientHeight - handle.offsetHeight
      if (totalHeight <= 0) return
      const nextHeight = Math.max(totalHeight * 0.2, Math.min(totalHeight * 0.75, startHeight + (event.clientY - startY)))
      pane.style.height = `${nextHeight}px`
    }

    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""

      const totalHeight = root.clientHeight - handle.offsetHeight
      if (!this.state || totalHeight <= 0) return
      const nextRatio = pane.offsetHeight / totalHeight
      this.state.resultsSplitRatio = Math.max(0.2, Math.min(0.75, nextRatio))
      this._persistState()
    }

    const onDown = (event: MouseEvent) => {
      startY = event.clientY
      startHeight = pane.offsetHeight
      document.body.style.userSelect = "none"
      document.body.style.cursor = "row-resize"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    }

    handle.addEventListener("mousedown", onDown)
    this.splitCleanup = () => {
      handle.removeEventListener("mousedown", onDown)
      onUp()
    }
  }

  private _destroyResultsSplit() {
    this.splitCleanup?.()
    this.splitCleanup = null
  }

}
