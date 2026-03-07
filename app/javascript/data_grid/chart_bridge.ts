import { evaluateConditions, getChartMarkers, getColorZones, type ConditionMatch } from "./condition_engine"
import type { Tab, Condition, ChartLink } from "../types/store"

export interface ChartBridgeMarker {
  time: number
  text: string
  color: string
  symbol: string
  mode: string
  modeDetail: string
  price?: number
  fontSize?: number
}

export default class ChartBridge {
  private tabsElement: HTMLElement
  private application: any

  constructor(tabsElement: HTMLElement, application: any) {
    this.tabsElement = tabsElement
    this.application = application
  }

  syncConditionsToChart(
    dataTab: Tab,
    chartTabs: Tab[],
    data: Array<Record<string, any>>,
  ): void {
    if (!dataTab.dataConfig) return

    const links = dataTab.dataConfig.chartLinks || []
    if (!links.length) {
      console.warn("[ChartBridge] No chart links for data tab", dataTab.id)
      return
    }

    const conditions = dataTab.dataConfig.conditions.filter(c => c.enabled)
    const matches = evaluateConditions(data, conditions)
    const markers = getChartMarkers(matches)
    const colorZones = getColorZones(matches)
    console.log("[ChartBridge] sync:", { conditions: conditions.length, matches: matches.size, markers: markers.length, colorZones: colorZones.length, links: links.length })

    for (const link of links) {
      const chartTab = chartTabs.find(t => t.id === link.chartTabId && t.type === "chart")
      if (!chartTab) {
        console.warn("[ChartBridge] Chart tab not found:", link.chartTabId)
        continue
      }

      const chartCtrl = this._findChartController(link.chartTabId, link.panelId)
      if (!chartCtrl) {
        console.warn("[ChartBridge] Chart controller not found for", link.chartTabId, link.panelId)
        continue
      }

      if (!conditions.length || !markers.length) {
        chartCtrl.setConditionLabels([])
      } else {
        const dataByTime = new Map<number, Record<string, any>>()
        for (const row of data) {
          if (row.time != null) dataByTime.set(row.time, row)
        }

        const labelMarkers = markers.map(m => {
          const row = dataByTime.get(m.time)
          return {
            time: m.time,
            price: row ? Number(row.high || row.close || 0) : 0,
            text: m.text || "●",
            color: m.color,
            fontSize: 1,
          }
        }).filter(m => m.price > 0)

        console.log("[ChartBridge] Setting", labelMarkers.length, "condition labels on chart")
        chartCtrl.setConditionLabels(labelMarkers)
      }

      if (!conditions.length || !colorZones.length) {
        if (chartCtrl.applyColorZones) chartCtrl.applyColorZones([])
      } else if (chartCtrl.applyColorZones) {
        chartCtrl.applyColorZones(colorZones)
      }
    }
  }

  navigateChartToTime(chartTabId: string, panelId: string, time: number): void {
    const ctrl = this._findChartController(chartTabId, panelId)
    if (!ctrl) return

    if (typeof ctrl._navigateToTime === "function") {
      ctrl._navigateToTime(time)
    } else if (ctrl.chart) {
      ctrl.chart.timeScale().scrollToRealTime()
    }
  }

  setupRowClickHandler(
    gridElement: HTMLElement,
    chartLinks: ChartLink[],
  ): void {
    gridElement.addEventListener("click", (e) => {
      const row = (e.target as HTMLElement).closest(".ag-row")
      if (!row) return

      const timeCell = row.querySelector("[col-id]")
      if (!timeCell) return

      const rowNode = (gridElement as any).__agGrid
      if (!rowNode) return
    })
  }

  setupCrosshairSync(
    chartTabId: string,
    panelId: string,
    onTimeHover: (time: number) => void,
  ): (() => void) | null {
    const ctrl = this._findChartController(chartTabId, panelId)
    if (!ctrl?.chart) return null

    const handler = (param: any) => {
      if (!param?.time) return
      const time = typeof param.time === "object"
        ? new Date(param.time.year, param.time.month - 1, param.time.day).getTime() / 1000
        : param.time
      onTimeHover(time)
    }

    ctrl.chart.subscribeCrosshairMove(handler)

    return () => ctrl.chart.unsubscribeCrosshairMove(handler)
  }

  private _findChartController(tabId: string, panelId: string): any {
    const wrapper = this.tabsElement.querySelector(`[data-tab-wrapper="${tabId}"]`)
    if (!wrapper) return null

    const panelEl = wrapper.querySelector(`[data-panel-id="${panelId}"]`)
    if (!panelEl) return null

    const chartEl = panelEl.querySelector("[data-controller='chart']")
    if (!chartEl) return null

    return this.application.getControllerForElementAndIdentifier(chartEl, "chart")
  }
}
