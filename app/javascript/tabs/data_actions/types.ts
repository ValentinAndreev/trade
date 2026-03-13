import type TabStore from "../store"
import type TabRenderer from "../renderer"
import type ChartBridge from "../../data_grid/chart_bridge"
import type { DataGridControllerAPI, StimulusApp, DataColumn, Panel } from "../../types/store"
import type { IndicatorInfo } from "../../data_grid/sidebar_renderer"

export interface DataTabDeps {
  store: TabStore
  renderer: TabRenderer
  chartBridge: ChartBridge
  sidebarTarget: HTMLElement
  panelsTarget: HTMLElement
  element: HTMLElement
  config: { symbols: string[]; indicators: IndicatorInfo[] }
  application: StimulusApp
  renderFn: () => void
}

/** Shared helpers available to all sub-action modules. */
export interface DataTabContext {
  deps: DataTabDeps
  getGridCtrl(tabId?: string): DataGridControllerAPI | null
  render(): void
  syncChartBridge(): void
  updateConditionStyles(): void
  addMissingIndicators(tab: { id: string; dataConfig?: { columns: DataColumn[] } }, chart: { panels: Panel[] }): void
}
