import { parseConditionFromBuilder, nextFilterMode } from "../../templates/condition_templates"
import type { DataTabContext } from "./types"

export class ConditionActions {
  constructor(private ctx: DataTabContext) {}

  private get store()   { return this.ctx.deps.store }
  private get sidebar() { return this.ctx.deps.sidebarTarget }
  private get renderer(){ return this.ctx.deps.renderer }

  toggleCondition(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    const cond = tab.dataConfig.conditions.find(c => c.id === condId)
    if (!cond) return
    this.store.updateCondition(tab.id, condId, { enabled: !cond.enabled })
    this.ctx.updateConditionStyles()
    this.ctx.render()
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  cycleConditionFilter(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    const cond = tab.dataConfig.conditions.find(c => c.id === condId)
    if (!cond) return
    this.store.updateCondition(tab.id, condId, { filterMode: nextFilterMode(cond.filterMode) })
    this.ctx.getGridCtrl(tab.id)?.refreshConditionMatches?.()
    this.ctx.render()
  }

  removeConditionBtn(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (condId) this.store.removeCondition(tab.id, condId)
    this.ctx.updateConditionStyles()
    this.ctx.render()
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  showAddCondition() {
    this.renderer.dataSidebar.showConditionBuilder = true
    this.ctx.render()
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
    this.ctx.updateConditionStyles()
    this.ctx.render()
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  cancelAddCondition() {
    this.renderer.dataSidebar.showConditionBuilder = false
    this.renderer.dataSidebar.editingConditionId = null
    this.ctx.render()
  }

  editCondition(e: Event) {
    const condId = (e.currentTarget as HTMLElement).dataset.conditionId
    if (!condId) return
    this.renderer.dataSidebar.editingConditionId = condId
    this.renderer.dataSidebar.showConditionBuilder = true
    this.ctx.render()
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
    this.ctx.updateConditionStyles()
    this.ctx.render()
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  onCondOperatorChange(e: Event) {
    const op = (e.currentTarget as HTMLSelectElement).value
    const isCross = ["cross_above", "cross_below"].includes(op)
    const isExpr  = op === "expression"

    const valueRow = this.sidebar.querySelector("[data-field-value-row]") as HTMLElement | null
    const crossRow = this.sidebar.querySelector("[data-field-cross-row]") as HTMLElement | null
    const exprRow  = this.sidebar.querySelector("[data-field-expr-row]")  as HTMLElement | null

    valueRow?.classList.toggle("hidden", isCross || isExpr)
    crossRow?.classList.toggle("hidden", !isCross)
    exprRow?.classList.toggle("hidden", !isExpr)

    if (valueRow) {
      const compareEl = valueRow.querySelector("[data-field='condCompareColumn']") as HTMLElement | null
      compareEl?.classList.toggle("hidden", op !== "between")
    }
  }

  onCondActionTypeChange(e: Event) {
    const type  = (e.currentTarget as HTMLSelectElement).value
    const textEl  = this.sidebar.querySelector("[data-field='condText']")  as HTMLElement | null
    const colorEl = this.sidebar.querySelector("[data-field='condColor']") as HTMLElement | null
    textEl?.classList.toggle("hidden",  type !== "chartMarker")
    colorEl?.classList.toggle("hidden", type === "nothing")
  }
}
