import { evaluateConditions, getChartMarkers, getColorZones, type ConditionMatch } from "./condition_engine"
import type { Tab, DataTableRow, StimulusApp, ChartControllerAPI } from "../types/store"

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
  private application: StimulusApp

  constructor(tabsElement: HTMLElement, application: StimulusApp) {
    this.tabsElement = tabsElement
    this.application = application
  }

  syncConditionsToChart(
    dataTab: Tab,
    chartTabs: Tab[],
    data: DataTableRow[],
  ): void {
    if (!dataTab.dataConfig) return

    const links = dataTab.dataConfig.chartLinks || []
    if (!links.length) {
      return
    }

    const conditions = dataTab.dataConfig.conditions.filter(c => c.enabled)
    const matches = evaluateConditions(data, conditions)
    const markers = getChartMarkers(matches)
    const colorZones = getColorZones(matches)

    for (const link of links) {
      const chartTab = chartTabs.find(t => t.id === link.chartTabId && t.type === "chart")
      if (!chartTab) {
        continue
      }

      const chartCtrl = this._findChartController(link.chartTabId, link.panelId)
      if (!chartCtrl) {
        continue
      }

      if (!conditions.length || !markers.length) {
        chartCtrl.setConditionLabels([])
      } else {
        const dataByTime = new Map<number, DataTableRow>()
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
      (ctrl.chart.timeScale() as { scrollToRealTime(): void }).scrollToRealTime()
    }
  }

  setupCrosshairSync(
    chartTabId: string,
    panelId: string,
    onTimeHover: (time: number) => void,
  ): (() => void) | null {
    const ctrl = this._findChartController(chartTabId, panelId)
    if (!ctrl?.chart) return null

    const handler = (param: { time?: number | { year: number; month: number; day: number } }) => {
      if (!param?.time) return
      const time = typeof param.time === "object"
        ? new Date(param.time.year, param.time.month - 1, param.time.day).getTime() / 1000
        : param.time
      onTimeHover(time)
    }

    const chart = ctrl.chart
    chart.subscribeCrosshairMove(handler)

    return () => chart?.unsubscribeCrosshairMove(handler)
  }

  private _findChartController(tabId: string, panelId: string): ChartControllerAPI | null {
    const wrapper = this.tabsElement.querySelector(`[data-tab-wrapper="${tabId}"]`)
    if (!wrapper) return null

    const panelEl = wrapper.querySelector(`[data-panel-id="${panelId}"]`)
    if (!panelEl) return null

    const chartEl = panelEl.querySelector("[data-controller='chart']")
    if (!chartEl) return null

    return this.application.getControllerForElementAndIdentifier(chartEl, "chart") as ChartControllerAPI
  }
}
