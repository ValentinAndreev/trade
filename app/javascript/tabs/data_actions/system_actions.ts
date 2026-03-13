import { parseSystemFromBuilder } from "../../templates/system_templates"
import type { DataTabContext } from "./types"

export class SystemActions {
  constructor(private ctx: DataTabContext) {}

  private get store()   { return this.ctx.deps.store }
  private get sidebar() { return this.ctx.deps.sidebarTarget }
  private get renderer(){ return this.ctx.deps.renderer }
  private get element() { return this.ctx.deps.element }

  addSystem() {
    this.renderer.dataSidebar.showSystemBuilder = true
    this.renderer.dataSidebar.editingSystemId = null
    this.ctx.render()
  }

  cancelSystem() {
    this.renderer.dataSidebar.showSystemBuilder = false
    this.renderer.dataSidebar.editingSystemId = null
    this.ctx.render()
  }

  confirmAddSystem() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const builder = this.sidebar.querySelector("[data-system-builder]") as HTMLElement | null
    if (!builder) return
    const system = parseSystemFromBuilder(builder)
    if (!system) return
    this.store.addSystem(tab.id, system)
    this.renderer.dataSidebar.showSystemBuilder = false
    this.ctx.render()
    this._refreshSystemSignals(tab.id)
  }

  editSystem(e: Event) {
    const systemId = (e.currentTarget as HTMLElement).dataset.systemId
    if (!systemId) return
    this.renderer.dataSidebar.editingSystemId = systemId
    this.renderer.dataSidebar.showSystemBuilder = true
    this.ctx.render()
  }

  confirmEditSystem() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const systemId = this.renderer.dataSidebar.editingSystemId
    if (!systemId) return
    const builder = this.sidebar.querySelector("[data-system-builder]") as HTMLElement | null
    if (!builder) return
    const updates = parseSystemFromBuilder(builder)
    if (!updates) return
    this.store.updateSystem(tab.id, systemId, updates)
    this.renderer.dataSidebar.showSystemBuilder = false
    this.renderer.dataSidebar.editingSystemId = null
    this.ctx.render()
    this._refreshSystemSignals(tab.id)
  }

  toggleSystem(e: Event) {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const systemId = (e.currentTarget as HTMLElement).dataset.systemId
    if (!systemId) return
    const sys = (tab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!sys) return
    this.store.updateSystem(tab.id, systemId, { enabled: !sys.enabled })
    this.ctx.render()
    this._refreshSystemSignals(tab.id)
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  toggleSystemOnChart(e: Event) {
    const el = e.currentTarget as HTMLElement
    const systemId = el.dataset.systemId
    if (!systemId) return
    const dataTabId = el.dataset.dataTabId
    const tab = dataTabId
      ? this.store.tabs.find(t => t.id === dataTabId && t.type === "data")
      : this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const sys = (tab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!sys) return
    this.store.updateSystem(tab.id, systemId, { showOnChart: !sys.showOnChart })
    this.ctx.render()
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  removeSystem(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data") return
    const systemId = (e.currentTarget as HTMLElement).dataset.systemId
    if (!systemId) return
    this.store.removeSystem(tab.id, systemId)
    this.ctx.render()
    this._refreshSystemSignals(tab.id)
    requestAnimationFrame(() => this.ctx.syncChartBridge())
  }

  openSystemStats(e: Event) {
    const systemId = (e.currentTarget as HTMLElement).dataset.systemId
    if (!systemId) return
    this.element.dispatchEvent(new CustomEvent("datatab:openSystemStats", {
      bubbles: true,
      detail: { systemId },
    }))
  }

  onSystemRuleOperatorChange(e: Event) {
    const select = e.currentTarget as HTMLSelectElement
    const prefix = select.dataset.prefix
    if (!prefix) return
    const op = select.value
    const isCross = ["cross_above", "cross_below"].includes(op)
    const container = select.closest("[data-system-builder]") as HTMLElement | null
    if (!container) return

    const valueRow = container.querySelector(`[data-field="${prefix}ValueRow"]`) as HTMLElement | null
    const crossRow = container.querySelector(`[data-field="${prefix}CrossRow"]`) as HTMLElement | null
    valueRow?.classList.toggle("hidden", isCross)
    crossRow?.classList.toggle("hidden", !isCross)

    if (valueRow) {
      const betweenCol = container.querySelector(`[data-field="${prefix}BetweenCol"]`) as HTMLElement | null
      betweenCol?.classList.toggle("hidden", op !== "between")
    }

    const arrow = crossRow?.querySelector("span") as HTMLElement | null
    if (arrow) arrow.textContent = op === "cross_below" ? "↘" : "↗"
  }

  onSystemDirectionToggle(e: Event) {
    const cb = e.currentTarget as HTMLInputElement
    const direction = cb.dataset.direction as "long" | "short" | undefined
    if (!direction) return
    const container = cb.closest("[data-system-builder]") as HTMLElement | null
    const section = container?.querySelector(`[data-section-${direction}]`) as HTMLElement | null
    if (section) section.classList.toggle("hidden", !cb.checked)
  }

  private _refreshSystemSignals(tabId: string) {
    const gridCtrl = this.ctx.getGridCtrl(tabId)
    gridCtrl?.refreshSystemSignals?.()
    const updated = this.store.tabs.find(t => t.id === tabId)
    if (updated?.dataConfig) gridCtrl?.applyColumnDefsOnly?.(updated.dataConfig)
  }
}
