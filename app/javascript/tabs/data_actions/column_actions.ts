import { validateFormulaReferences, evaluateFormulaExpression } from "../../data_grid/condition_engine"
import { columnFieldKey } from "../../types/store"
import type { DataColumn, DataConfig } from "../../types/store"
import type { DataTabContext } from "./types"

export class ColumnActions {
  constructor(private ctx: DataTabContext) {}

  private get store()  { return this.ctx.deps.store }
  private get sidebar(){ return this.ctx.deps.sidebarTarget }
  private get renderer(){ return this.ctx.deps.renderer }

  showAddColumn() {
    this.sidebar.querySelector("[data-add-column-form]")?.classList.remove("hidden")
  }

  hideAddColumn() {
    this.sidebar.querySelector("[data-add-column-form]")?.classList.add("hidden")
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
      paramsEl.innerHTML = this.renderer.dataSidebar.instrumentParamsHTML(this.ctx.deps.config.symbols)
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
    this.ctx.render()
    if (["indicator", "change", "instrument"].includes(colType)) {
      requestAnimationFrame(() => this.ctx.deps.renderFn())
    }
  }

  removeColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const columnId = (e.currentTarget as HTMLElement).dataset.columnId
    if (columnId) this.store.removeDataColumn(tab.id, columnId)
    this.ctx.render()
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
    this.ctx.render()
    const updated = this.store.activeTab
    if (updated?.type === "data" && updated.dataConfig) {
      const gridCtrl = this.ctx.getGridCtrl(updated.id)
      if (gridCtrl?.applyColumnDefsOnly) gridCtrl.applyColumnDefsOnly(updated.dataConfig)
    }
  }

  editFormulaColumn(e: Event) {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const colId = el.dataset.columnId || el.closest("[data-column-id]")?.getAttribute("data-column-id")
    if (!colId) return
    this.renderer.dataSidebar.editingFormulaId = colId
    this.ctx.render()
  }

  saveFormulaColumn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const el = e.currentTarget as HTMLElement
    const colId = el.dataset.columnId || el.closest("[data-column-id]")?.getAttribute("data-column-id")
    if (!colId) return

    const labelEl = this.sidebar.querySelector("[data-field='editFormulaLabel']") as HTMLInputElement | null
    const exprEl  = this.sidebar.querySelector("[data-field='editFormulaExpression']") as HTMLInputElement | null
    const rawLabel  = labelEl?.value?.trim()
    const expression = exprEl?.value?.trim()

    const col = tab.dataConfig.columns.find(c => c.id === colId)
    if (col && col.type === "formula") {
      if (expression !== undefined) {
        if (expression.trim() !== "") {
          const validKeys = this._validFormulaColumnKeys(tab)
          if (!this._checkFormulaValid(expression, validKeys, "[data-field='editFormulaExpression']")) return
        }
        col.expression = expression
      }
      if (rawLabel) col.label = this._uniqueLabel(tab, rawLabel, colId)
      this.store.updateDataConfig(tab.id, { columns: [...tab.dataConfig.columns] })
    }

    this.renderer.dataSidebar.editingFormulaId = null
    this.ctx.render()
  }

  cancelFormulaEdit() {
    this.renderer.dataSidebar.editingFormulaId = null
    this.ctx.render()
  }

  exportCsv() {
    const tab = this.store.activeTab
    const ctrl = this.ctx.getGridCtrl()
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

  // --- Private helpers ---

  private _buildAndAddColumn(tab: { id: string; dataConfig?: DataConfig }, colType: string): boolean {
    if (colType === "change") {
      const period = (this.sidebar.querySelector("[data-field='changePeriod']") as HTMLSelectElement | null)?.value || "5m"
      this.store.addDataColumn(tab.id, { type: "change", label: this._uniqueLabel(tab, `change_${period}`), changePeriod: period })
      return true
    }
    if (colType === "formula")    return this._addFormulaColumn(tab)
    if (colType === "instrument") return this._addInstrumentColumn(tab)
    return this._addIndicatorColumn(tab)
  }

  private _nextFormulaLabel(tab: { dataConfig?: { columns: Array<{ label: string }> } }): string {
    const existing = new Set((tab.dataConfig?.columns ?? []).map(c => c.label))
    for (let i = 1; i < 1000; i++) {
      const candidate = `formula${i}`
      if (!existing.has(candidate)) return candidate
    }
    return `formula_${Date.now()}`
  }

  private _addFormulaColumn(tab: { id: string; dataConfig?: DataConfig }): boolean {
    const rawLabel   = (this.sidebar.querySelector("[data-field='formulaLabel']") as HTMLInputElement | null)?.value?.trim()
    const expression = (this.sidebar.querySelector("[data-field='formulaExpression']") as HTMLInputElement | null)?.value?.trim() || ""
    if (!expression) return false
    const label = rawLabel ? this._uniqueLabel(tab, rawLabel) : this._nextFormulaLabel(tab)
    const validKeys = this._validFormulaColumnKeys(tab)
    validKeys.add(label)
    if (!this._checkFormulaValid(expression, validKeys, "[data-field='formulaExpression']")) return false
    this.store.addDataColumn(tab.id, { type: "formula", label, expression })
    return true
  }

  private _addInstrumentColumn(tab: { id: string; dataConfig?: DataConfig }): boolean {
    const symbol = (this.sidebar.querySelector("[data-field='instrumentSymbol']") as HTMLSelectElement | null)?.value?.trim() || ""
    const field  = (this.sidebar.querySelector("[data-field='instrumentField']") as HTMLSelectElement | null)?.value || "close"
    if (!symbol) return false
    this.store.addDataColumn(tab.id, {
      type: "instrument", label: this._uniqueLabel(tab, `${symbol.toLowerCase()}_${field}`),
      instrumentSymbol: symbol, instrumentField: field,
    })
    return true
  }

  private _addIndicatorColumn(tab: { id: string; dataConfig?: DataConfig }): boolean {
    const indType = (this.sidebar.querySelector("[data-field='indicatorType']") as HTMLSelectElement | null)?.value?.trim().toLowerCase() || "sma"
    const period  = parseInt((this.sidebar.querySelector("[data-field='indicatorPeriod']") as HTMLInputElement | null)?.value || "20", 10) || 20
    this.store.addDataColumn(tab.id, {
      type: "indicator", label: this._uniqueLabel(tab, `${indType}_${period}`),
      indicatorType: indType, indicatorParams: { period },
    })
    return true
  }

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

  private _columnLabelExists(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, label: string, excludeId?: string): boolean {
    if (!tab.dataConfig) return false
    return tab.dataConfig.columns.some(c => c.label === label && c.id !== excludeId)
  }

  _validFormulaColumnKeys(tab: { dataConfig?: { columns: DataColumn[] } }): Set<string> {
    const keys = new Set<string>(["time"])
    if (!tab.dataConfig?.columns) return keys
    for (const col of tab.dataConfig.columns) keys.add(columnFieldKey(col))
    return keys
  }

  _uniqueLabel(tab: { dataConfig?: { columns: Array<{ label: string; id: string }> } }, base: string, excludeId?: string): string {
    if (!this._columnLabelExists(tab, base, excludeId)) return base
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}_${i}`
      if (!this._columnLabelExists(tab, candidate, excludeId)) return candidate
    }
    return `${base}_${Date.now()}`
  }
}
