import type TabStore from "../store"
import type TabRenderer from "../renderer"
import type ChartBridge from "../../data_grid/chart_bridge"
import type { DataGridControllerAPI, StimulusApp, DataColumn, Panel } from "../../types/store"
import type { IndicatorInfo } from "../../data_grid/sidebar_renderer"

import { ColumnActions }    from "./column_actions"
import { ConditionActions } from "./condition_actions"
import { SystemActions }    from "./system_actions"
import { LinkActions }      from "./link_actions"
import { DataSyncActions }  from "./data_sync"
import type { DataTabDeps, DataTabContext } from "./types"

export type { DataTabDeps }

export default class DataTabActions {
  private cols:       ColumnActions
  private conditions: ConditionActions
  private systems:    SystemActions
  private links:      LinkActions
  private sync:       DataSyncActions

  private ctx: DataTabContext

  constructor(private deps: DataTabDeps) {
    this.ctx = {
      deps,
      getGridCtrl: (tabId?) => this._getGridCtrl(tabId),
      render:       () => this.deps.renderFn(),
      syncChartBridge:       () => this.sync.syncChartBridge(),
      updateConditionStyles: () => this.sync.updateConditionStyles(),
      addMissingIndicators:  (tab, chart) => this.links._addMissingIndicators(tab, chart),
    }
    this.cols       = new ColumnActions(this.ctx)
    this.conditions = new ConditionActions(this.ctx)
    this.systems    = new SystemActions(this.ctx)
    this.links      = new LinkActions(this.ctx)
    this.sync       = new DataSyncActions(this.ctx)
  }

  // --- Grid controller helper ---

  private _getGridCtrl(tabId?: string): DataGridControllerAPI | null {
    const selector = tabId
      ? `[data-tab-wrapper="${tabId}"] [data-controller='data-grid']`
      : "[data-controller='data-grid']"
    const gridEl = this.deps.panelsTarget.querySelector(selector)
    if (!gridEl) return null
    return this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as DataGridControllerAPI | null
  }

  // --- Symbol / Timeframe / Date ---

  updateDataSymbol(e: Event) {
    const tab = this.deps.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const symbol = (e.currentTarget as HTMLSelectElement).value?.trim() || ""
    if (symbol && tab.dataConfig.columns?.length) {
      this._renameOhlcvColumnLabels(tab.dataConfig.columns, symbol)
    }
    this.deps.store.updateDataConfig(tab.id, { symbols: symbol ? [symbol] : [] })
    this.deps.renderFn()
  }

  updateDataTimeframe(e: Event) {
    const tab = this.deps.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const timeframe = (e.currentTarget as HTMLSelectElement).value
    this.deps.store.updateDataConfig(tab.id, { timeframe })
    this.deps.renderFn()
  }

  updateDataDateRange() {
    const tab = this.deps.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const startTime = this._readDateTime("dataStartDate", "dataStartHour", "dataStartMinute")
    const endTime   = this._readDateTime("dataEndDate", "dataEndHour", "dataEndMinute", true)
    this.deps.store.updateDataConfig(tab.id, { startTime, endTime })
  }

  setDataDateRangeAndLoad() {
    const tab = this.deps.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const startTime = this._readDateTime("dataStartDate", "dataStartHour", "dataStartMinute")
    const isLinked  = this.deps.store.isLinkedDataTab(tab)
    const updates: { startTime?: number; endTime?: number; userConfiguredStart?: boolean } = {
      startTime,
      userConfiguredStart: !!startTime,
    }
    if (!isLinked) {
      updates.endTime = this._readDateTime("dataEndDate", "dataEndHour", "dataEndMinute", true)
    }
    this.deps.store.updateDataConfig(tab.id, updates)
    this.deps.renderFn()
    this.sync.loadDataGrid()
  }

  // --- Collapse toggles ---

  toggleDataColumns() {
    this.deps.renderer.dataSidebar.columnsCollapsed = !this.deps.renderer.dataSidebar.columnsCollapsed
    this.deps.renderFn()
  }

  toggleDataConditions() {
    this.deps.renderer.dataSidebar.conditionsCollapsed = !this.deps.renderer.dataSidebar.conditionsCollapsed
    this.deps.renderFn()
  }

  toggleDataSystems() {
    this.deps.renderer.dataSidebar.systemsCollapsed = !this.deps.renderer.dataSidebar.systemsCollapsed
    this.deps.renderFn()
  }

  // --- Delegated actions ---

  showAddColumn()                           { this.cols.showAddColumn() }
  hideAddColumn()                           { this.cols.hideAddColumn() }
  onNewColumnTypeChange(e: Event)           { this.cols.onNewColumnTypeChange(e) }
  addColumn()                               { this.cols.addColumn() }
  removeColumn(e: Event)                    { this.cols.removeColumn(e) }
  toggleColumnVisibility(e: Event)          { this.cols.toggleColumnVisibility(e) }
  editFormulaColumn(e: Event)               { this.cols.editFormulaColumn(e) }
  saveFormulaColumn(e: Event)               { this.cols.saveFormulaColumn(e) }
  cancelFormulaEdit()                       { this.cols.cancelFormulaEdit() }
  exportCsv()                               { this.cols.exportCsv() }

  toggleCondition(e: Event)                 { this.conditions.toggleCondition(e) }
  cycleConditionFilter(e: Event)            { this.conditions.cycleConditionFilter(e) }
  removeConditionBtn(e: Event)              { this.conditions.removeConditionBtn(e) }
  showAddCondition()                        { this.conditions.showAddCondition() }
  confirmAddCondition()                     { this.conditions.confirmAddCondition() }
  cancelAddCondition()                      { this.conditions.cancelAddCondition() }
  editCondition(e: Event)                   { this.conditions.editCondition(e) }
  confirmEditCondition()                    { this.conditions.confirmEditCondition() }
  onCondOperatorChange(e: Event)            { this.conditions.onCondOperatorChange(e) }
  onCondActionTypeChange(e: Event)          { this.conditions.onCondActionTypeChange(e) }

  addSystem()                               { this.systems.addSystem() }
  cancelSystem()                            { this.systems.cancelSystem() }
  confirmAddSystem()                        { this.systems.confirmAddSystem() }
  editSystem(e: Event)                      { this.systems.editSystem(e) }
  confirmEditSystem()                       { this.systems.confirmEditSystem() }
  toggleSystem(e: Event)                    { this.systems.toggleSystem(e) }
  toggleSystemOnChart(e: Event)             { this.systems.toggleSystemOnChart(e) }
  removeSystem(e: Event)                    { this.systems.removeSystem(e) }
  openSystemStats(e: Event)                 { this.systems.openSystemStats(e) }
  onSystemRuleOperatorChange(e: Event)      { this.systems.onSystemRuleOperatorChange(e) }
  onSystemDirectionToggle(e: Event)         { this.systems.onSystemDirectionToggle(e) }

  showAddChartLink()                        { this.links.showAddChartLink() }
  cancelAddChartLink()                      { this.links.cancelAddChartLink() }
  confirmAddChartLink()                     { this.links.confirmAddChartLink() }
  removeChartLink(e: Event)                 { this.links.removeChartLink(e) }

  loadDataGrid()                            { return this.sync.loadDataGrid() }
  syncChartBridge()                         { this.sync.syncChartBridge() }
  updateConditionStyles()                   { this.sync.updateConditionStyles() }
  syncIndicatorsFromChart()                 { this.sync.syncIndicatorsFromChart() }
  syncAllDataConditionsToChart(id: string)  { this.sync.syncAllDataConditionsToChart(id) }
  onDataGridRowClick(e: Event)              { this.sync.onDataGridRowClick(e) }
  onDataGridTimeRange(e: Event)             { this.sync.onDataGridTimeRange(e) }
  onDataGridLoaded()                        { this.sync.onDataGridLoaded() }

  // --- Private helpers (also used by link_actions) ---

  private _readDateTime(dateField: string, hourField: string, minuteField: string, endOfMinute = false): number | undefined {
    const sidebar = this.deps.sidebarTarget
    const dateEl   = sidebar.querySelector(`[data-field='${dateField}']`)   as HTMLInputElement | null
    const hourEl   = sidebar.querySelector(`[data-field='${hourField}']`)   as HTMLInputElement | null
    const minuteEl = sidebar.querySelector(`[data-field='${minuteField}']`) as HTMLInputElement | null
    const date = dateEl?.value
    if (!date) return undefined
    const h   = Math.min(23, Math.max(0, hourEl?.value   ? (parseInt(hourEl.value,   10) || 0) : 0))
    const m   = Math.min(59, Math.max(0, minuteEl?.value ? (parseInt(minuteEl.value, 10) || 0) : 0))
    const sec = endOfMinute ? 59 : 0
    const iso = `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.000Z`
    return Math.floor(new Date(iso).getTime() / 1000)
  }

  private _renameOhlcvColumnLabels(columns: Array<{ type: string; label: string }>, symbol: string): void {
    const prefix = `${symbol.toLowerCase()}_`
    const ohlcv  = new Set(["open", "high", "low", "close", "volume"])
    for (const col of columns) {
      if (ohlcv.has(col.type)) col.label = `${prefix}${col.type}`
    }
  }
}
