import { Controller } from "@hotwired/stimulus"
import { fetchConfig, type AppConfig } from "../tabs/config"
import { showToast } from "../services/toast"
import type { ProcessedResearchRun } from "../research/types"
import { ResearchEquityView } from "../research/equity_view"
import { OptimizationChart } from "../research/optimization_chart"
import { renderRunsGrid, type RunsGridView } from "../research/runs_grid"
import {
  metricLabel,
  optimizationTargetLabel,
} from "../research/catalog"
import { runResearch } from "../research/request"
import { cancelResearch } from "../research/dsl"
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
} from "../research/state"
import { metricValue, optimizationParamKey, optimizationParamValue } from "../research/summary"
import { renderResearchHTML } from "../research/templates"
import { buildDefaultStatsPanelState } from "../system_stats/stats_panel"
import type { ResearchConfig, ResearchTopPaneKey } from "../types/store"

export default class extends Controller {
  static values = {
    tabId: String,
    config: String,
  }

  declare tabIdValue: string
  declare configValue: string

  private config: AppConfig | null = null
  private runs: ProcessedResearchRun[] = []
  private state: ResearchConfig | null = null
  private selectedRunIndex = 0
  private busy = false
  private cancelling = false
  private currentRunId: string | null = null
  private busyStartedAt: number | null = null
  private busyElapsedSeconds = 0
  private busyTimer: ReturnType<typeof setInterval> | null = null
  private serverProgress: ResearchProgressSnapshot | null = null
  private progressSubscription: ResearchProgressSubscription | null = null
  private splitCleanup: (() => void) | null = null
  private optimizationChart: OptimizationChart | null = null
  private runsGridView: RunsGridView | null = null
  private selectedRunView: SelectedRunView | null = null
  private equityView: ResearchEquityView | null = null
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
    this._destroyTopViews()
    this._destroySelectedRunView()
  }

  async run(nextState?: ResearchConfig) {
    if (nextState) this.state = { ...nextState }
    if (!this.state) return

    const runId = buildResearchRunId()
    this.busy = true
    this.cancelling = false
    this.currentRunId = runId
    this.runs = []
    this.selectedRunIndex = 0
    this.busyStartedAt = Date.now()
    this.busyElapsedSeconds = 0
    this.serverProgress = null
    this._disconnectProgressSubscription()
    this._persistResult()
    this.progressSubscription = new ResearchProgressSubscription(runId, (snapshot) => {
      this.serverProgress = snapshot
      if (snapshot.event === "cancelled") {
        this.cancelling = false
      }
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
      this.cancelling = false
      this.currentRunId = null
      this._stopBusyTimer()
      this.serverProgress = null
      this._disconnectProgressSubscription()
      this._renderSafely()
    }
  }

  async cancelRun() {
    if (!this.busy || this.cancelling || !this.currentRunId) return
    this.cancelling = true
    this._renderSafely()
    await cancelResearch(this.currentRunId)
  }

  private _render() {
    if (!this.state || !this.config) return

    this._destroyResultsSplit()
    this._destroyTopViews()
    this._destroySelectedRunView()

    this.element.innerHTML = renderResearchHTML({
      state: this.state,
      busy: this.busy,
      runsCount: this.runs.length,
      progress: this.busy ? { ...buildResearchProgressInfo(this.state, this.busyElapsedSeconds, this.serverProgress), cancelling: this.cancelling } : null,
    })

    this._renderSelectedRun()
    this._renderTopViewsSafely()
    this._setupResultsSplit()
  }

  private _renderTopViewsSafely() {
    try {
      this._renderTopViews()
    } catch (error) {
      console.error("[Research] Top research views render failed:", error)
      const equityEl = this.element.querySelector("[data-selected-run-equity]") as HTMLElement | null
      const chartEl = this.element.querySelector("[data-optimization-chart]") as HTMLElement | null
      const gridEl = this.element.querySelector("[data-runs-grid]") as HTMLElement | null
      if (equityEl) {
        equityEl.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">Equity chart failed to render.</div>`
      }
      if (chartEl) {
        chartEl.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">Optimization chart failed to render.</div>`
      }
      if (gridEl && !gridEl.innerHTML.trim()) {
        gridEl.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">Optimization table is unavailable.</div>`
      }
      showToast("Research overview render failed")
    }
  }

  private _renderTopViews() {
    this._destroyTopViews()
    if (!this.state || this.busy) return
    const state = this.state

    this._renderEquityView()
    const chartEl = this.element.querySelector("[data-optimization-chart]") as HTMLElement | null
    const gridEl = this.element.querySelector("[data-runs-grid]") as HTMLElement | null

    if (this.runs.length <= 1) return

    if (chartEl) {
      this.optimizationChart = new OptimizationChart(
        chartEl,
        this.runs.map((run, index) => ({
          index,
          x: optimizationParamValue(run, state.optimizationTarget),
          y: metricValue(run.stats, state.selectedMetric),
        })),
        this.selectedRunIndex,
        optimizationTargetLabel(state.optimizationTarget),
        metricLabel(state.selectedMetric),
        (index: number) => this._selectRun(index)
      )
      this.optimizationChart.build()
    }

    if (gridEl) {
      this.runsGridView = renderRunsGrid(
        gridEl,
        this.runs,
        this.selectedRunIndex,
        optimizationParamKey(this.state.optimizationTarget),
        optimizationTargetLabel(this.state.optimizationTarget),
        (index: number) => this._selectRun(index)
      )
    }
  }

  private _renderSelectedRun() {
    if (!this.state) return

    const container = this.element.querySelector("[data-selected-run]") as HTMLElement | null
    if (!container) return

    this._destroySelectedRunView()
    this.selectedRunView = new SelectedRunView(container)

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
    this._renderEquityView()
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

  private _destroyTopViews() {
    this.equityView?.destroy()
    this.equityView = null
    this.optimizationChart?.destroy()
    this.optimizationChart = null
    this.runsGridView?.destroy()
    this.runsGridView = null
  }

  private _renderEquityView() {
    this.equityView?.destroy()
    this.equityView = null

    const run = this.runs[this.selectedRunIndex]
    const equityEl = this.element.querySelector("[data-selected-run-equity]") as HTMLElement | null
    if (!run || !equityEl) return

    this.equityView = new ResearchEquityView(equityEl, this.statsPanelState)
    this.equityView.render(run.stats)
  }

  private _startBusyTimer() {
    this._stopBusyTimer()
    this.busyTimer = setInterval(() => {
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

  private _storedConfig(): Partial<ResearchConfig> | null {
    if (!this.configValue) return null
    try {
      return JSON.parse(this.configValue) as Partial<ResearchConfig>
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
    if (!this.state || !this._hasTopWorkspace()) return

    const root = this.element.querySelector("[data-research-results-root]") as HTMLElement | null
    const pane = this.element.querySelector("[data-research-top-workspace]") as HTMLElement | null
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

  toggleTopPaneExpand(e: Event) {
    const paneKey = (e.currentTarget as HTMLElement).dataset.paneKey as ResearchTopPaneKey | undefined
    if (!this.state || !paneKey) return
    this.state.topPaneExpanded = this.state.topPaneExpanded === paneKey ? null : paneKey
    this._persistState()
    this._renderSafely()
  }

  private _hasTopWorkspace(): boolean {
    return !this.busy && this.runs.length > 0
  }

}
