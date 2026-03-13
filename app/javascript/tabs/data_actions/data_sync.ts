import { getHighlightStyles } from "../../data_grid/condition_engine"
import { injectConditionStyles } from "../../utils/dom"
import type { DataTabContext } from "./types"

export class DataSyncActions {
  constructor(private ctx: DataTabContext) {}

  private get store() { return this.ctx.deps.store }

  syncChartBridge() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return
    const ctrl = this.ctx.getGridCtrl(tab.id)
    const data = ctrl?.getData()
    if (!data?.length) return
    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    this.ctx.deps.chartBridge.syncConditionsToChart(tab, chartTabs, data)
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
      tab = this.store.activeTab!
    }

    const activeId = tab?.id
    let ctrl = this.ctx.getGridCtrl(activeId)
    if (!ctrl) {
      await new Promise(r => setTimeout(r, 100))
      ctrl = this.ctx.getGridCtrl(activeId)
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
        const isLinked = !!tab.dataConfig.sourceTabId
        if (!isLinked && times.length && (!tab.dataConfig.startTime || !tab.dataConfig.endTime)) {
          this.store.updateDataConfig(tab.id, { startTime: times[0], endTime: times[times.length - 1] })
        }
      }
    }

    this.ctx.syncChartBridge()
  }

  syncIndicatorsFromChart() {
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig?.sourceTabId) return
    const chart = this.store.tabs.find(t => t.id === tab.dataConfig!.sourceTabId && t.type === "chart")
    if (chart) this.ctx.addMissingIndicators(tab, chart)
  }

  syncAllDataConditionsToChart(chartTabId: string): void {
    const dataTabs = this.store.tabs.filter(t =>
      t.type === "data" && t.dataConfig?.chartLinks?.some(l => l.chartTabId === chartTabId)
    )
    if (!dataTabs.length) return
    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    for (const dt of dataTabs) {
      const ctrl = this.ctx.getGridCtrl(dt.id)
      const data = ctrl?.getData()
      if (!data?.length) continue
      this.ctx.deps.chartBridge.syncConditionsToChart(dt, chartTabs, data)
    }
  }

  onDataGridRowClick(e: Event): void {
    const time = (e as CustomEvent).detail?.time
    if (!time) return
    const tab = this.store.activeTab
    if (!tab?.dataConfig?.chartLinks?.length) return
    for (const link of tab.dataConfig.chartLinks) {
      this.ctx.deps.chartBridge.navigateChartToTime(link.chartTabId, link.panelId, time)
    }
  }

  onDataGridTimeRange(e: Event): void {
    const { startTime, endTime } = (e as CustomEvent).detail || {}
    if (!startTime || !endTime) return
    const tab = this.store.activeTab
    if (!tab?.dataConfig) return
    if (tab.dataConfig.startTime != null || tab.dataConfig.endTime != null) return
    if (tab.dataConfig.sourceTabId) { this.ctx.render(); return }
    if (tab.dataConfig.startTime !== startTime || tab.dataConfig.endTime !== endTime) {
      this.store.updateDataConfig(tab.id, { startTime, endTime })
      this.ctx.render()
    }
  }

  onDataGridLoaded(): void {
    const chartTabs = this.store.tabs.filter(t => t.type === "chart")
    for (const ct of chartTabs) {
      this.syncAllDataConditionsToChart(ct.id)
    }
  }

  private _refreshLinkedSymbolAndTimeframe(tab: { id: string; dataConfig?: { symbols: string[]; timeframe: string; chartLinks: Array<{ chartTabId: string; panelId: string }> } }): void {
    const link = tab.dataConfig?.chartLinks?.[0]
    if (!link) return
    const chartTab = this.store.tabs.find(t => t.id === link.chartTabId && t.type === "chart")
    const panel    = chartTab?.panels.find(p => p.id === link.panelId)
    if (!panel?.overlays.length) return
    const primarySymbol = panel.overlays[0].symbol
    const updates: { symbols?: string[]; timeframe?: string } = {}
    if (primarySymbol)   updates.symbols   = [primarySymbol]
    if (panel.timeframe) updates.timeframe = panel.timeframe
    if (Object.keys(updates).length) this.store.updateDataConfig(tab.id, updates)
  }
}
