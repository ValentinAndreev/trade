import type { DataConfig, DataColumn, Panel, Tab } from "../../types/store"
import type { DataTabContext } from "./types"

export class LinkActions {
  constructor(private ctx: DataTabContext) {}

  private get store()   { return this.ctx.deps.store }
  private get sidebar() { return this.ctx.deps.sidebarTarget }
  private get renderer(){ return this.ctx.deps.renderer }

  showAddChartLink() {
    this.renderer.dataSidebar.showLinkSelector = true
    this.ctx.render()
  }

  cancelAddChartLink() {
    this.renderer.dataSidebar.showLinkSelector = false
    this.ctx.render()
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
      this.ctx.render()
      return
    }

    tab.dataConfig.chartLinks = [{ chartTabId, panelId }]
    this._initConfigFromChart(tab, chartTab)
    this.store.updateDataConfig(tab.id, { chartLinks: tab.dataConfig.chartLinks })
    this.store.moveTabNextToChart(tab.id, chartTabId)
    this.renderer.dataSidebar.showLinkSelector = false
    this.ctx.render()
    requestAnimationFrame(() => {
      this.ctx.deps.renderFn()
      this.sidebar.dispatchEvent(new CustomEvent("tabs:startLinkedDataRefresh", { bubbles: true }))
    })
  }

  removeChartLink(e: Event) {
    e.stopPropagation()
    const tab = this.store.activeTab
    if (!tab || tab.type !== "data" || !tab.dataConfig) return

    const linkIdx = parseInt((e.currentTarget as HTMLElement).dataset.linkIndex || "0", 10)
    const link = tab.dataConfig.chartLinks[linkIdx]
    const chartTabId = link?.chartTabId
    if (link) this.ctx.deps.chartBridge.clearChartMarkers(link.chartTabId, link.panelId)
    tab.dataConfig.chartLinks.splice(linkIdx, 1)

    const updates: Partial<DataConfig> = { chartLinks: tab.dataConfig.chartLinks }
    if (!tab.dataConfig.chartLinks.length) {
      updates.sourceTabId = undefined
      const range = this._getGridTimeRange(tab.id)
      if (range) {
        updates.startTime = range.startTime
        updates.endTime   = range.endTime
      }
      this.store.updateDataConfig(tab.id, updates)
      if (chartTabId) this.store.moveUnlinkedTabAfterGroup(tab.id, chartTabId)
      const unlinkedTabId = tab.id
      const unlinkedConfig = tab.dataConfig
      this.ctx.render()
      this._applyConfigOnlyToGrid(unlinkedTabId, unlinkedConfig)
    } else {
      this.store.updateDataConfig(tab.id, updates)
      this.ctx.render()
    }
  }

  // --- Private helpers ---

  private _getGridTimeRange(tabId: string): { startTime: number; endTime: number } | null {
    const ctrl = this.ctx.getGridCtrl(tabId)
    const data = ctrl?.getData?.()
    if (!data?.length) return null
    const times = data.map(r => r.time).filter((t): t is number => typeof t === "number").sort((a, b) => a - b)
    if (!times.length) return null
    return { startTime: times[0], endTime: times[times.length - 1] }
  }

  private _applyConfigOnlyToGrid(tabId: string, config: DataConfig | undefined): void {
    if (!config) return
    const ctrl = this.ctx.getGridCtrl(tabId)
    if (typeof ctrl?.applyConfigOnly === "function") ctrl.applyConfigOnly(config)
  }

  _initConfigFromChart(dataTab: { id: string; dataConfig?: DataConfig }, chart: Tab): void {
    if (!dataTab.dataConfig) return
    const panel = this.store.primaryPanel(chart)
    if (!panel) return
    const primarySymbol = panel.overlays[0]?.symbol
    if (primarySymbol) {
      dataTab.dataConfig.symbols = [primarySymbol]
      this._renameOhlcvColumnLabels(dataTab.dataConfig.columns, primarySymbol)
    }
    dataTab.dataConfig.timeframe  = panel.timeframe
    dataTab.dataConfig.sourceTabId = chart.id
    this._addMissingIndicators(dataTab, chart)
  }

  private _renameOhlcvColumnLabels(columns: Array<{ type: string; label: string }>, symbol: string): void {
    const prefix = `${symbol.toLowerCase()}_`
    const ohlcv = new Set(["open", "high", "low", "close", "volume"])
    for (const col of columns) {
      if (ohlcv.has(col.type)) col.label = `${prefix}${col.type}`
    }
  }

  _addMissingIndicators(tab: { id: string; dataConfig?: { columns: DataColumn[] } }, chart: { panels: Panel[] }): void {
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
        const key    = `${overlay.indicatorType}:${JSON.stringify(params)}`
        if (existingIndicators.has(key)) continue
        const paramStr  = Object.values(params).join("_")
        const fieldName = paramStr ? `${overlay.indicatorType}_${paramStr}` : overlay.indicatorType
        this.store.addDataColumn(tab.id, {
          type: "indicator", label: fieldName,
          indicatorType: overlay.indicatorType, indicatorParams: params,
        })
        existingIndicators.add(key)
      }
    }
  }
}
