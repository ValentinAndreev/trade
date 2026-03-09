import TabStore from "./store"
import type TabRenderer from "./renderer"
import type ChartBridge from "../data_grid/chart_bridge"
import { parseConditionFromBuilder } from "../templates/condition_templates"
import { getHighlightStyles } from "../data_grid/condition_engine"
import { injectConditionStyles } from "../utils/dom"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"

interface DataTabDeps {
  store: TabStore
  renderer: TabRenderer
  chartBridge: ChartBridge
  sidebarTarget: HTMLElement
  panelsTarget: HTMLElement
  config: { symbols: string[]; indicators: IndicatorInfo[] }
  application: any
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
    const symbol = (e.currentTarget as HTMLSelectElement).value
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

  updateDataDateRange() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const startEl = this.sidebar.querySelector("[data-field='dataStartTime']") as HTMLInputElement | null
    const endEl = this.sidebar.querySelector("[data-field='dataEndTime']") as HTMLInputElement | null
    const startTime = startEl?.value ? Math.floor(new Date(startEl.value + "Z").getTime() / 1000) : undefined
    const endTime = endEl?.value ? Math.floor(new Date(endEl.value + "Z").getTime() / 1000) : undefined
    this.store.updateDataConfig(tab.id, { startTime, endTime })
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

    if (colType === "change") {
      const periodEl = this.sidebar.querySelector("[data-field='changePeriod']") as HTMLSelectElement | null
      const period = periodEl?.value || "5m"
      const label = this._uniqueLabel(tab, `change_${period}`)
      this.store.addDataColumn(tab.id, { type: "change", label, changePeriod: period })
    } else if (colType === "formula") {
      const labelEl = this.sidebar.querySelector("[data-field='formulaLabel']") as HTMLInputElement | null
      const exprEl = this.sidebar.querySelector("[data-field='formulaExpression']") as HTMLInputElement | null
      const rawLabel = labelEl?.value?.trim() || "formula"
      const expression = exprEl?.value?.trim() || ""
      if (!expression) return
      const label = this._uniqueLabel(tab, rawLabel)
      this.store.addDataColumn(tab.id, { type: "formula", label, expression })
    } else if (colType === "instrument") {
      const symbolEl = this.sidebar.querySelector("[data-field='instrumentSymbol']") as HTMLSelectElement | null
      const fieldEl = this.sidebar.querySelector("[data-field='instrumentField']") as HTMLSelectElement | null
      const symbol = symbolEl?.value?.trim() || ""
      const field = fieldEl?.value || "close"
      if (!symbol) return
      const label = this._uniqueLabel(tab, `${symbol.toLowerCase()}_${field}`)
      this.store.addDataColumn(tab.id, {
        type: "instrument", label, instrumentSymbol: symbol, instrumentField: field,
      })
    } else {
      const indTypeEl = this.sidebar.querySelector("[data-field='indicatorType']") as HTMLSelectElement | null
      const indPeriodEl = this.sidebar.querySelector("[data-field='indicatorPeriod']") as HTMLInputElement | null
      const indType = indTypeEl?.value?.trim().toLowerCase() || "sma"
      const period = parseInt(indPeriodEl?.value || "20", 10) || 20
      const fieldName = this._uniqueLabel(tab, `${indType}_${period}`)
      this.store.addDataColumn(tab.id, {
        type: "indicator", label: fieldName, indicatorType: indType, indicatorParams: { period },
      })
    }

    this.render()
    if (["indicator", "change", "instrument"].includes(colType)) {
      requestAnimationFrame(() => this.loadDataGrid())
    }
  }

  removeColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const columnId = (e.currentTarget as HTMLElement).dataset.columnId
    if (columnId) this.store.removeDataColumn(tab.id, columnId)
    this.render()
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
      if (rawLabel) col.label = this._uniqueLabel(tab, rawLabel, colId)
      if (expression !== undefined) col.expression = expression
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
    if (!tab || tab.type !== "data") return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    const checked = (e.currentTarget as HTMLInputElement).checked
    this.store.updateCondition(tab.id, condId, { enabled: checked })
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

  addChartLink() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart" && t.panels.length > 0)
    if (!chartTabs.length) return

    const firstChart = chartTabs[0]
    const panelId = firstChart.panels[0]?.id
    if (!panelId) return

    const exists = tab.dataConfig.chartLinks.some(
      l => l.chartTabId === firstChart.id && l.panelId === panelId,
    )
    if (exists) return

    tab.dataConfig.chartLinks.push({ chartTabId: firstChart.id, panelId })
    this.store.updateDataConfig(tab.id, { chartLinks: tab.dataConfig.chartLinks })
    this.syncChartBridge()
    this.render()
  }

  removeChartLink(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const linkIdx = parseInt((e.currentTarget as HTMLElement).dataset.linkIndex || "0", 10)
    tab.dataConfig.chartLinks.splice(linkIdx, 1)
    this.store.updateDataConfig(tab.id, { chartLinks: tab.dataConfig.chartLinks })
    this.render()
  }

  // --- Grid sync & export ---

  syncChartBridge() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const gridEl = this.panels.querySelector("[data-controller='data-grid']")
    if (!gridEl) return
    const ctrl = this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    const data = ctrl?.getData() as Array<Record<string, any>> | undefined
    if (!data?.length) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    this.deps.chartBridge.syncConditionsToChart(tab, chartTabs, data)
  }

  updateConditionStyles() {
    const tab = this.store.activeTab
    if (!tab?.dataConfig) return
    injectConditionStyles(getHighlightStyles(tab.dataConfig.conditions))
  }

  updateGridSettings() {
    // read on next render/load
  }

  async loadDataGrid() {
    const gridEl = this.panels.querySelector("[data-controller='data-grid']")
    if (!gridEl) return

    let ctrl = this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    if (!ctrl) {
      await new Promise(r => requestAnimationFrame(r))
      ctrl = this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    }
    if (!ctrl) return

    await ctrl.loadData()

    const tab = this.store.activeTab
    if (tab?.type === "data" && tab.dataConfig) {
      const data = ctrl.getData() as Array<Record<string, any>>
      if (data?.length) {
        const times = data.map(r => r.time).filter(Boolean).sort((a: number, b: number) => a - b)
        if (times.length && (!tab.dataConfig.startTime || !tab.dataConfig.endTime)) {
          this.store.updateDataConfig(tab.id, {
            startTime: times[0],
            endTime: times[times.length - 1],
          })
          this.render()
        }
      }
    }

    this.syncChartBridge()
  }

  exportCsv() {
    const gridEl = this.panels.querySelector("[data-controller='data-grid']")
    if (!gridEl) return
    const ctrl = this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
    const data = ctrl?.getData() as Array<Record<string, any>> | undefined
    if (!data?.length) return

    const keys = Object.keys(data[0])
    const header = keys.join(",")
    const rows = data.map(row => keys.map(k => row[k] ?? "").join(","))
    const csv = [header, ...rows].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
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

  syncAllDataConditionsToChart(chartTabId: string): void {
    const dataTabs = this.store.tabs.filter(t =>
      t.type === "data" && t.dataConfig?.chartLinks?.some(l => l.chartTabId === chartTabId)
    )
    if (!dataTabs.length) return

    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    for (const dt of dataTabs) {
      const gridEl = this.panels.querySelector(`[data-tab-wrapper="${dt.id}"] [data-controller='data-grid']`)
      if (!gridEl) continue
      const ctrl = this.deps.application.getControllerForElementAndIdentifier(gridEl, "data-grid") as any
      const data = ctrl?.getData() as Array<Record<string, any>> | undefined
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

  private _columnLabelExists(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, label: string, excludeId?: string): boolean {
    if (!tab.dataConfig) return false
    return tab.dataConfig.columns.some(c => c.label === label && c.id !== excludeId)
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
