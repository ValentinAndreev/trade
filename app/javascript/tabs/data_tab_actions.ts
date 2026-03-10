import TabStore from "./store"
import type TabRenderer from "./renderer"
import type ChartBridge from "../data_grid/chart_bridge"
import { parseConditionFromBuilder } from "../templates/condition_templates"
import { getHighlightStyles, validateFormulaReferences, evaluateFormulaExpression } from "../data_grid/condition_engine"
import type { DataColumn, DataConfig, DataGridControllerAPI, DataTableRow, ChartLink, StimulusApp, Tab, Panel } from "../types/store"
import { columnFieldKey } from "../types/store"
import { injectConditionStyles } from "../utils/dom"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"

interface DataTabDeps {
  store: TabStore
  renderer: TabRenderer
  chartBridge: ChartBridge
  sidebarTarget: HTMLElement
  panelsTarget: HTMLElement
  config: { symbols: string[]; indicators: IndicatorInfo[] }
  application: StimulusApp
  renderFn: () => void
}

export default class DataTabActions {
  private deps: DataTabDeps

  constructor(deps: DataTabDeps) {
    this.deps = deps
  }

  private get store() { return this.deps.store }
  private get renderer() { return this.deps.renderer }
  private get sidebar() { return this.deps.sidebarTarget }
  private get panels() { return this.deps.panelsTarget }
  private get render() { return this.deps.renderFn }

  // --- Symbol / Timeframe / Date ---

  updateDataSymbol(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const symbol = (e.currentTarget as HTMLSelectElement).value?.trim() || ""
    if (symbol && tab.dataConfig.columns?.length) {
      this._renameOhlcvColumnLabels(tab.dataConfig.columns, symbol)
    }
    this.store.updateDataConfig(tab.id, { symbols: symbol ? [symbol] : [] })
    this.render()
  }

  updateDataTimeframe(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const timeframe = (e.currentTarget as HTMLSelectElement).value
    this.store.updateDataConfig(tab.id, { timeframe })
    this.render()
  }

  /** Read date + hour (0–23) + minute from sidebar inputs, return UTC unix seconds or undefined. */
  private _readDateTimeFromInputs(
    dateField: string,
    hourField: string,
    minuteField: string,
    endOfMinute = false,
  ): number | undefined {
    const dateEl = this.sidebar.querySelector(`[data-field='${dateField}']`) as HTMLInputElement | null
    const hourEl = this.sidebar.querySelector(`[data-field='${hourField}']`) as HTMLInputElement | null
    const minuteEl = this.sidebar.querySelector(`[data-field='${minuteField}']`) as HTMLInputElement | null
    const date = dateEl?.value
    const hour = hourEl?.value != null && hourEl.value !== "" ? parseInt(hourEl.value, 10) : 0
    const minute = minuteEl?.value != null && minuteEl.value !== "" ? parseInt(minuteEl.value, 10) : 0
    if (!date) return undefined
    const h = Math.min(23, Math.max(0, isNaN(hour) ? 0 : hour))
    const m = Math.min(59, Math.max(0, isNaN(minute) ? 0 : minute))
    const sec = endOfMinute ? 59 : 0
    const iso = `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.000Z`
    return Math.floor(new Date(iso).getTime() / 1000)
  }

  updateDataDateRange() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const startTime = this._readDateTimeFromInputs("dataStartDate", "dataStartHour", "dataStartMinute")
    const endTime = this._readDateTimeFromInputs("dataEndDate", "dataEndHour", "dataEndMinute", true)
    this.store.updateDataConfig(tab.id, { startTime, endTime })
  }

  setDataDateRangeAndLoad() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const startTime = this._readDateTimeFromInputs("dataStartDate", "dataStartHour", "dataStartMinute")
    const isLinked = this.store.isLinkedDataTab(tab)
    const updates: { startTime?: number; endTime?: number; userConfiguredStart?: boolean } = {
      startTime,
      userConfiguredStart: !!startTime,  // mark as user-set so it survives reloads
    }
    if (!isLinked) {
      updates.endTime = this._readDateTimeFromInputs("dataEndDate", "dataEndHour", "dataEndMinute", true)
    }
    this.store.updateDataConfig(tab.id, updates)
    this.render()
    this.loadDataGrid()
  }

  // --- Collapse toggles ---

  toggleDataColumns() {
    this.renderer.dataSidebar.columnsCollapsed = !this.renderer.dataSidebar.columnsCollapsed
    this.render()
  }

  toggleDataConditions() {
    this.renderer.dataSidebar.conditionsCollapsed = !this.renderer.dataSidebar.conditionsCollapsed
    this.render()
  }

  // --- Columns ---

  showAddColumn() {
    const form = this.sidebar.querySelector("[data-add-column-form]")
    if (form) form.classList.remove("hidden")
  }

  hideAddColumn() {
    const form = this.sidebar.querySelector("[data-add-column-form]")
    if (form) form.classList.add("hidden")
  }

  onNewColumnTypeChange(e: Event) {
    const type = (e.currentTarget as HTMLSelectElement).value
    const paramsEl = this.sidebar.querySelector("[data-column-params]")
    if (!paramsEl) return

    if (type === "change") {
      paramsEl.innerHTML = this.renderer.dataSidebar.changeParamsHTML()
    } else if (type === "formula") {
      paramsEl.innerHTML = this.renderer.dataSidebar.formulaParamsHTML()
    } else if (type === "instrument") {
      paramsEl.innerHTML = this.renderer.dataSidebar.instrumentParamsHTML(this.deps.config.symbols)
    } else {
      paramsEl.innerHTML = this.renderer.dataSidebar.indicatorParamsHTML()
    }
  }

  addColumn() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return

    const typeEl = this.sidebar.querySelector("[data-field='newColumnType']") as HTMLSelectElement | null
    const colType = typeEl?.value || "indicator"

    const added = this._buildAndAddColumn(tab, colType)
    if (!added) return

    this.render()
    if (["indicator", "change", "instrument"].includes(colType)) {
      requestAnimationFrame(() => this.loadDataGrid())
    }
  }

  private _buildAndAddColumn(tab: { id: string; dataConfig?: DataConfig }, colType: string): boolean {
    if (colType === "change") {
      const period = (this.sidebar.querySelector("[data-field='changePeriod']") as HTMLSelectElement | null)?.value || "5m"
      this.store.addDataColumn(tab.id, { type: "change", label: this._uniqueLabel(tab, `change_${period}`), changePeriod: period })
      return true
    }
    if (colType === "formula") return this._addFormulaColumn(tab)
    if (colType === "instrument") return this._addInstrumentColumn(tab)
    return this._addIndicatorColumn(tab)
  }

  private _addFormulaColumn(tab: { id: string; dataConfig?: DataConfig }): boolean {
    const rawLabel = (this.sidebar.querySelector("[data-field='formulaLabel']") as HTMLInputElement | null)?.value?.trim() || "formula"
    const expression = (this.sidebar.querySelector("[data-field='formulaExpression']") as HTMLInputElement | null)?.value?.trim() || ""
    if (!expression) return false

    const label = this._uniqueLabel(tab, rawLabel)
    const validKeys = this._validFormulaColumnKeys(tab)
    validKeys.add(label)
    if (!this._checkFormulaValid(expression, validKeys, "[data-field='formulaExpression']")) return false

    this.store.addDataColumn(tab.id, { type: "formula", label, expression })
    return true
  }

  private _addInstrumentColumn(tab: { id: string; dataConfig?: DataConfig }): boolean {
    const symbol = (this.sidebar.querySelector("[data-field='instrumentSymbol']") as HTMLSelectElement | null)?.value?.trim() || ""
    const field = (this.sidebar.querySelector("[data-field='instrumentField']") as HTMLSelectElement | null)?.value || "close"
    if (!symbol) return false
    this.store.addDataColumn(tab.id, {
      type: "instrument", label: this._uniqueLabel(tab, `${symbol.toLowerCase()}_${field}`), instrumentSymbol: symbol, instrumentField: field,
    })
    return true
  }

  private _addIndicatorColumn(tab: { id: string; dataConfig?: DataConfig }): boolean {
    const indType = (this.sidebar.querySelector("[data-field='indicatorType']") as HTMLSelectElement | null)?.value?.trim().toLowerCase() || "sma"
    const period = parseInt((this.sidebar.querySelector("[data-field='indicatorPeriod']") as HTMLInputElement | null)?.value || "20", 10) || 20
    this.store.addDataColumn(tab.id, {
      type: "indicator", label: this._uniqueLabel(tab, `${indType}_${period}`), indicatorType: indType, indicatorParams: { period },
    })
    return true
  }

  /** Validate formula and show/hide error message. Returns true if valid. */
  private _checkFormulaValid(expression: string, validKeys: Set<string>, fieldSelector: string): boolean {
    const invalidRef = validateFormulaReferences(expression, validKeys)
    const errEl = this.sidebar.querySelector(fieldSelector)?.parentElement?.querySelector("[data-formula-error]") as HTMLElement | null
    if (invalidRef) {
      if (errEl) { errEl.textContent = `Unknown column: ${invalidRef}`; errEl.classList.remove("hidden") }
      return false
    }
    if (errEl) { errEl.textContent = ""; errEl.classList.add("hidden") }
    return true
  }

  removeColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const columnId = (e.currentTarget as HTMLElement).dataset.columnId
    if (columnId) this.store.removeDataColumn(tab.id, columnId)
    this.render()
  }

  toggleColumnVisibility(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const columnId = (e.currentTarget as HTMLElement).dataset.columnId
    if (!columnId) return
    const col = tab.dataConfig.columns.find(c => c.id === columnId)
    if (!col) return
    const visible = col.visible !== false
    this.store.setDataColumnVisible(tab.id, columnId, !visible)
    this.render()
    const updated = this.store.activeTab
    if (updated?.type === "data" && updated.dataConfig) {
      const gridCtrl = this._getGridCtrl(updated.id)
      if (gridCtrl?.applyColumnDefsOnly) gridCtrl.applyColumnDefsOnly(updated.dataConfig)
    }
  }

  editFormulaColumn(e: Event) {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const colId = el.dataset.columnId || el.closest("[data-column-id]")?.getAttribute("data-column-id")
    if (!colId) return
    this.renderer.dataSidebar.editingFormulaId = colId
    this.render()
  }

  saveFormulaColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const el = e.currentTarget as HTMLElement
    const colId = el.dataset.columnId || el.closest("[data-column-id]")?.getAttribute("data-column-id")
    if (!colId) return

    const labelEl = this.sidebar.querySelector("[data-field='editFormulaLabel']") as HTMLInputElement | null
    const exprEl = this.sidebar.querySelector("[data-field='editFormulaExpression']") as HTMLInputElement | null
    const rawLabel = labelEl?.value?.trim()
    const expression = exprEl?.value?.trim()

    const col = tab.dataConfig.columns.find(c => c.id === colId)
    if (col && col.type === "formula") {
      if (expression !== undefined) {
        const toValidate = expression.trim()
        if (toValidate !== "") {
          const validKeys = this._validFormulaColumnKeys(tab)
          if (!this._checkFormulaValid(expression, validKeys, "[data-field='editFormulaExpression']")) return
        }
        col.expression = expression
      }
      if (rawLabel) col.label = this._uniqueLabel(tab, rawLabel, colId)
      this.store.updateDataConfig(tab.id, { columns: [...tab.dataConfig.columns] })
    }

    this.renderer.dataSidebar.editingFormulaId = null
    this.render()
  }

  cancelFormulaEdit() {
    this.renderer.dataSidebar.editingFormulaId = null
    this.render()
  }

  // --- Conditions ---

  toggleCondition(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    const cond = tab.dataConfig.conditions.find(c => c.id === condId)
    if (!cond) return
    this.store.updateCondition(tab.id, condId, { enabled: !cond.enabled })
    this.updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this.syncChartBridge())
  }

  removeConditionBtn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (condId) this.store.removeCondition(tab.id, condId)
    this.updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this.syncChartBridge())
  }

  showAddCondition() {
    this.renderer.dataSidebar.showConditionBuilder = true
    this.render()
  }

  confirmAddCondition() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const builder = this.sidebar.querySelector("[data-condition-builder]") as HTMLElement | null
    if (!builder) return

    const condition = parseConditionFromBuilder(builder)
    if (!condition) return

    this.store.addCondition(tab.id, condition)
    this.renderer.dataSidebar.showConditionBuilder = false
    this.updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this.syncChartBridge())
  }

  cancelAddCondition() {
    this.renderer.dataSidebar.showConditionBuilder = false
    this.renderer.dataSidebar.editingConditionId = null
    this.render()
  }

  editCondition(e: Event) {
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    this.renderer.dataSidebar.editingConditionId = condId
    this.renderer.dataSidebar.showConditionBuilder = true
    this.render()
  }

  confirmEditCondition() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const condId = this.renderer.dataSidebar.editingConditionId
    if (!condId) return

    const builder = this.sidebar.querySelector("[data-condition-builder]") as HTMLElement | null
    if (!builder) return

    const updates = parseConditionFromBuilder(builder)
    if (!updates) return

    this.store.updateCondition(tab.id, condId, updates)
    this.renderer.dataSidebar.showConditionBuilder = false
    this.renderer.dataSidebar.editingConditionId = null
    this.updateConditionStyles()
    this.render()
    requestAnimationFrame(() => this.syncChartBridge())
  }

  onCondOperatorChange(e: Event) {
    const op = (e.currentTarget as HTMLSelectElement).value
    const isCross = ["cross_above", "cross_below"].includes(op)
    const isExpr = op === "expression"

    const valueRow = this.sidebar.querySelector("[data-field-value-row]") as HTMLElement | null
    const crossRow = this.sidebar.querySelector("[data-field-cross-row]") as HTMLElement | null
    const exprRow = this.sidebar.querySelector("[data-field-expr-row]") as HTMLElement | null

    if (valueRow) valueRow.classList.toggle("hidden", isCross || isExpr)
    if (crossRow) crossRow.classList.toggle("hidden", !isCross)
    if (exprRow) exprRow.classList.toggle("hidden", !isExpr)

    if (valueRow) {
      const compareEl = valueRow.querySelector("[data-field='condCompareColumn']") as HTMLElement | null
      if (compareEl) compareEl.classList.toggle("hidden", op !== "between")
    }
  }

  onCondActionTypeChange(e: Event) {
    const type = (e.currentTarget as HTMLSelectElement).value
    const textEl = this.sidebar.querySelector("[data-field='condText']") as HTMLElement | null
    if (textEl) textEl.classList.toggle("hidden", type !== "chartMarker")
  }

  // --- Chart links ---

  showAddChartLink() {
    this.renderer.dataSidebar.showLinkSelector = true
    this.render()
  }

  cancelAddChartLink() {
    this.renderer.dataSidebar.showLinkSelector = false
    this.render()
  }

  confirmAddChartLink() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const selectEl = this.sidebar.querySelector("[data-field='linkChartTabId']") as HTMLSelectElement | null
    const chartTabId = selectEl?.value
    if (!chartTabId) return

    const chartTab = this.store.tabs.find(t => t.id === chartTabId && t.type === "chart")
    if (!chartTab || !chartTab.panels.length) return

    const panelId = (this.store.primaryPanel(chartTab) ?? chartTab.panels[0]).id
    const alreadyLinked = tab.dataConfig.chartLinks.length === 1
      && tab.dataConfig.chartLinks[0].chartTabId === chartTabId
      && tab.dataConfig.chartLinks[0].panelId === panelId
    if (alreadyLinked) {
      this.renderer.dataSidebar.showLinkSelector = false
      this.render()
      return
    }

    tab.dataConfig.chartLinks = [{ chartTabId, panelId }]
    this._initConfigFromChart(tab, chartTab)
    this.store.updateDataConfig(tab.id, { chartLinks: tab.dataConfig.chartLinks })
    this.store.moveTabNextToChart(tab.id, chartTabId)
    this.renderer.dataSidebar.showLinkSelector = false
    this.render()
    requestAnimationFrame(() => {
      this.loadDataGrid()
      this.sidebar.dispatchEvent(new CustomEvent("tabs:startLinkedDataRefresh", { bubbles: true }))
    })
  }

  removeChartLink(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const linkIdx = parseInt((e.currentTarget as HTMLElement).dataset.linkIndex || "0", 10)
    const chartTabId = tab.dataConfig.chartLinks[linkIdx]?.chartTabId
    tab.dataConfig.chartLinks.splice(linkIdx, 1)
    const updates: Partial<DataConfig> = { chartLinks: tab.dataConfig.chartLinks }
    if (!tab.dataConfig.chartLinks.length) {
      updates.sourceTabId = undefined
      const range = this._getGridTimeRange(tab.id)
      if (range) {
        updates.startTime = range.startTime
        updates.endTime = range.endTime
      }
      this.store.updateDataConfig(tab.id, updates)
      if (chartTabId) this.store.moveUnlinkedTabAfterGroup(tab.id, chartTabId)
      const unlinkedTabId = tab.id
      const unlinkedConfig = tab.dataConfig
      this.render()
      this._applyConfigOnlyToGrid(unlinkedTabId, unlinkedConfig)
    } else {
      this.store.updateDataConfig(tab.id, updates)
      this.render()
    }
  }

  /** Read current row time range from grid so we can persist it on unlink (data survives reload). */
  private _getGridTimeRange(tabId: string): { startTime: number; endTime: number } | null {
    const ctrl = this._getGridCtrl(tabId)
    const data = ctrl?.getData?.()
    if (!data?.length) return null
    const times = data.map(r => r.time).filter((t): t is number => typeof t === "number").sort((a, b) => a - b)
    if (!times.length) return null
    return { startTime: times[0], endTime: times[times.length - 1] }
  }

  /** Update grid config without reloading data (keeps current rows after unlink). */
  private _applyConfigOnlyToGrid(tabId: string, config: DataConfig | undefined): void {
    if (!config) return
    const ctrl = this._getGridCtrl(tabId)
    if (typeof ctrl?.applyConfigOnly === "function") ctrl.applyConfigOnly(config)
  }

  // --- Grid controller helper ---

  private _getGridCtrl(tabId?: string): DataGridControllerAPI | null {
    const selector = tabId
      ? `[data-tab-wrapper="${tabId}"] [data-controller='data-grid']`
      : "[data-controller='data-grid']"
    const gridEl = this.panels.querySelector(selector)
    if (!gridEl) return null
    return this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as DataGridControllerAPI | null
  }

  // --- Grid sync & export ---

  syncChartBridge() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const ctrl = this._getGridCtrl(tab.id)
    const data = ctrl?.getData()
    if (!data?.length) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    this.deps.chartBridge.syncConditionsToChart(tab, chartTabs, data)
  }

  updateConditionStyles() {
    const tab = this.store.activeTab
    if (!tab?.dataConfig) return
    injectConditionStyles(getHighlightStyles(tab.dataConfig.conditions))
  }

  async loadDataGrid() {
    let tab = this.store.activeTab
    if (tab?.type === "data" && tab.dataConfig && this.store.isLinkedDataTab(tab)) {
      this._refreshLinkedSymbolAndTimeframe(tab)
      this.render()
      tab = this.store.activeTab!
    }

    const activeId = tab?.id
    let ctrl = this._getGridCtrl(activeId)
    if (!ctrl) {
      await new Promise(r => setTimeout(r, 100))
      ctrl = this._getGridCtrl(activeId)
    }
    if (!ctrl) return

    if (tab?.type === "data" && tab.dataConfig && typeof ctrl.loadWithConfig === "function") {
      await ctrl.loadWithConfig(tab.dataConfig)
    } else {
      await ctrl.loadData()
    }

    if (tab?.type === "data" && tab.dataConfig) {
      const data = ctrl.getData()
      if (data?.length) {
        const times = data.map(r => r.time).filter(Boolean).sort((a: number, b: number) => a - b)
        // Only auto-save range for unlinked tabs. Linked tabs never persist startTime/endTime
        // automatically — stale auto-saved values cause data rollback on reload.
        const isLinked = !!tab.dataConfig.sourceTabId
        if (!isLinked && times.length && (!tab.dataConfig.startTime || !tab.dataConfig.endTime)) {
          this.store.updateDataConfig(tab.id, { startTime: times[0], endTime: times[times.length - 1] })
          this.render()
        }
      }
    }

    this.syncChartBridge()
  }

  exportCsv() {
    const tab = this.store.activeTab
    const ctrl = this._getGridCtrl()
    const data = ctrl?.getData()
    if (!data?.length) return

    const escape = (v: unknown): string => {
      const s = v == null ? "" : String(v)
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
    }

    const columns = tab?.dataConfig?.columns
    let csv: string

    if (columns?.length) {
      const header = columns.map(c => escape(c.label)).join(",")
      const rows = data.map(row =>
        columns.map(col => {
          const value = col.type === "formula" && col.expression
            ? evaluateFormulaExpression(col.expression, row)
            : row[columnFieldKey(col)]
          return escape(value)
        }).join(",")
      )
      csv = [header, ...rows].join("\n")
    } else {
      const keys = Object.keys(data[0])
      csv = [keys.join(","), ...data.map(row => keys.map(k => escape(row[k])).join(","))].join("\n")
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `data_export_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  syncIndicatorsFromChart() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig?.sourceTabId) return
    const chart = this.store.tabs.find(t => t.id === tab.dataConfig!.sourceTabId && t.type === "chart")
    if (!chart) return
    this._addMissingIndicators(tab, chart)
  }

  syncAllDataConditionsToChart(chartTabId: string): void {
    const dataTabs = this.store.tabs.filter(t =>
      t.type === "data" && t.dataConfig?.chartLinks?.some(l => l.chartTabId === chartTabId)
    )
    if (!dataTabs.length) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    for (const dt of dataTabs) {
      const ctrl = this._getGridCtrl(dt.id)
      const data = ctrl?.getData()
      if (!data?.length) continue
      this.deps.chartBridge.syncConditionsToChart(dt, chartTabs, data)
    }
  }

  // --- Events from data grid ---

  onDataGridRowClick(e: Event): void {
    const time = (e as CustomEvent).detail?.time
    if (!time) return

    const tab = this.store.activeTab
    if (!tab?.dataConfig?.chartLinks?.length) return

    for (const link of tab.dataConfig.chartLinks) {
      this.deps.chartBridge.navigateChartToTime(link.chartTabId, link.panelId, time)
    }
  }

  onDataGridTimeRange(e: Event): void {
    const { startTime, endTime } = (e as CustomEvent).detail || {}
    if (!startTime || !endTime) return
    const tab = this.store.activeTab
    if (!tab?.dataConfig) return
    // Do not overwrite user-set range (e.g. after Set): only sync when config has no range yet
    if (tab.dataConfig.startTime != null || tab.dataConfig.endTime != null) return

    // Linked tabs: never auto-save startTime/endTime — stale values cause data rollback on reload.
    // startTime is only saved when user explicitly clicks "Set" (sets userConfiguredStart flag).
    if (tab.dataConfig.sourceTabId) return

    if (tab.dataConfig.startTime !== startTime || tab.dataConfig.endTime !== endTime) {
      this.store.updateDataConfig(tab.id, { startTime, endTime })
      this.render()
    }
  }

  onDataGridLoaded(): void {
    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    for (const ct of chartTabs) {
      this.syncAllDataConditionsToChart(ct.id)
    }
  }

  // --- Private helpers ---

  private _initConfigFromChart(dataTab: { id: string; dataConfig?: DataConfig }, chart: Tab): void {
    if (!dataTab.dataConfig) return
    const panel = this.store.primaryPanel(chart)
    if (!panel) return
    const primarySymbol = panel.overlays[0]?.symbol
    if (primarySymbol) {
      dataTab.dataConfig.symbols = [primarySymbol]
      this._renameOhlcvColumnLabels(dataTab.dataConfig.columns, primarySymbol)
    }
    dataTab.dataConfig.timeframe = panel.timeframe
    dataTab.dataConfig.sourceTabId = chart.id
    this._addMissingIndicators(dataTab, chart)
  }

  private _renameOhlcvColumnLabels(columns: Array<{ type: string; label: string }>, symbol: string): void {
    const prefix = `${symbol.toLowerCase()}_`
    const map: Record<string, string> = { open: "open", high: "high", low: "low", close: "close", volume: "volume" }
    for (const col of columns) {
      if (map[col.type]) col.label = `${prefix}${col.type}`
    }
  }

  private _addMissingIndicators(tab: { id: string; dataConfig?: { columns: DataColumn[] } }, chart: { panels: Panel[] }): void {
    if (!tab.dataConfig) return
    const existingIndicators = new Set(
      tab.dataConfig.columns
        .filter(c => c.type === "indicator")
        .map(c => `${c.indicatorType}:${JSON.stringify(c.indicatorParams || {})}`)
    )
    for (const panel of chart.panels) {
      for (const overlay of panel.overlays) {
        if (overlay.mode !== "indicator" || !overlay.indicatorType) continue
        const params = overlay.indicatorParams || {}
        const key = `${overlay.indicatorType}:${JSON.stringify(params)}`
        if (existingIndicators.has(key)) continue
        const paramStr = Object.values(params).join("_")
        const fieldName = paramStr ? `${overlay.indicatorType}_${paramStr}` : overlay.indicatorType
        this.store.addDataColumn(tab.id, {
          type: "indicator", label: fieldName, indicatorType: overlay.indicatorType, indicatorParams: params,
        })
        existingIndicators.add(key)
      }
    }
  }

  private _refreshLinkedSymbolAndTimeframe(tab: { id: string; dataConfig?: { symbols: string[]; timeframe: string; chartLinks: Array<{ chartTabId: string; panelId: string }> } }): void {
    const link = tab.dataConfig?.chartLinks?.[0]
    if (!link) return
    const chartTab = this.store.tabs.find(t => t.id === link.chartTabId && t.type === "chart")
    const panel = chartTab?.panels.find(p => p.id === link.panelId)
    if (!panel?.overlays.length) return
    const primarySymbol = panel.overlays[0].symbol
    const updates: { symbols?: string[]; timeframe?: string } = {}
    if (primarySymbol) updates.symbols = [primarySymbol]
    if (panel.timeframe) updates.timeframe = panel.timeframe
    if (Object.keys(updates).length) this.store.updateDataConfig(tab.id, updates)
  }


  private _columnLabelExists(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, label: string, excludeId?: string): boolean {
    if (!tab.dataConfig) return false
    return tab.dataConfig.columns.some(c => c.label === label && c.id !== excludeId)
  }

  private _validFormulaColumnKeys(tab: { dataConfig?: { columns: DataColumn[] } }): Set<string> {
    const keys = new Set<string>(["time"])
    if (!tab.dataConfig?.columns) return keys
    for (const col of tab.dataConfig.columns) keys.add(columnFieldKey(col))
    return keys
  }

  private _uniqueLabel(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, base: string, excludeId?: string): string {
    if (!this._columnLabelExists(tab, base, excludeId)) return base
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}_${i}`
      if (!this._columnLabelExists(tab, candidate, excludeId)) return candidate
    }
    return `${base}_${Date.now()}`
  }
}
