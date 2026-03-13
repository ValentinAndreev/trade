import { evaluateConditions, getChartMarkers, getColorZones } from "./condition_engine"
import { generateTrades } from "./system_engine"
import type { Tab, DataTableRow, StimulusApp, ChartControllerAPI, TradingSystem, LabelMarkerInput } from "../types/store"

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

      const dataByTime = new Map<number, DataTableRow>()
      for (const row of data) {
        if (row.time != null) dataByTime.set(row.time, row)
      }

      const conditionMarkers: LabelMarkerInput[] = (!conditions.length || !markers.length) ? [] :
        markers.map(m => {
          const row = dataByTime.get(m.time)
          return {
            time: m.time,
            price: row ? Number(row.high || row.close || 0) : 0,
            text: m.text || "●",
            color: m.color,
            fontSize: 1,
          }
        }).filter(m => m.price > 0)

      const systemMarkers = this._buildSystemMarkers(
        (dataTab.dataConfig?.systems ?? []),
        data,
        dataByTime,
      )

      const allMarkers = [...conditionMarkers, ...systemMarkers]
      chartCtrl.setConditionLabels(allMarkers)

      if (!conditions.length || !colorZones.length) {
        if (chartCtrl.applyColorZones) chartCtrl.applyColorZones([])
      } else if (chartCtrl.applyColorZones) {
        chartCtrl.applyColorZones(colorZones)
      }
    }
  }

  private _buildSystemMarkers(
    systems: TradingSystem[],
    data: DataTableRow[],
    dataByTime: Map<number, DataTableRow>,
  ): LabelMarkerInput[] {
    // Collect raw markers; price = actual low/high of the candle (no % offset — pixel offset
    // is applied in TextLabelsPaneView.update() via stackIndex + below fields).
    type RawMarker = { time: number; price: number; below: boolean; color: string; text: string; subtext: string }
    const raw: RawMarker[] = []

    for (const sys of systems) {
      if (!sys.enabled || !sys.showOnChart) continue

      const trades = generateTrades(sys, data)

      // Build directly from trades (not getSystemSignals) so that exit+entry
      // on the same bar both appear — a Map would silently overwrite one of them.
      const longClr  = sys.longColor  ?? "#26a69a"
      const shortClr = sys.shortColor ?? "#ef5350"

      for (const trade of trades) {
        const entryRow = dataByTime.get(trade.entryTime)
        if (entryRow) {
          const isLong = trade.direction === "long"
          const clr = isLong ? longClr : shortClr
          raw.push({
            time: trade.entryTime,
            price: isLong ? Number(entryRow.low || entryRow.close) : Number(entryRow.high || entryRow.close),
            below: isLong,
            color: clr,
            text: isLong ? `▲ ${trade.entryPrice.toFixed(2)}` : `▼ ${trade.entryPrice.toFixed(2)}`,
            subtext: sys.name,
          })
        }

        if (trade.exitTime != null && trade.exitPrice != null) {
          const exitRow = dataByTime.get(trade.exitTime)
          if (exitRow) {
            const isLong = trade.direction === "long"
            const pnl = trade.pnl ?? 0
            const pct = trade.pnlPercent ?? 0
            const sign = pnl >= 0 ? "+" : ""
            raw.push({
              time: trade.exitTime,
              price: isLong ? Number(exitRow.high || exitRow.close) : Number(exitRow.low || exitRow.close),
              below: !isLong,
              color: pnl >= 0 ? longClr : shortClr,
              text: `${sign}${pnl.toFixed(2)} (${sign}${pct.toFixed(2)}%)`,
              subtext: sys.name,
            })
          }
        }
      }
    }

    // Assign stackIndex per (time, below) slot so the primitive can offset in pixel space
    const slotCount = new Map<string, number>()

    return raw.map(m => {
      const key = `${m.time}:${m.below ? "b" : "a"}`
      const stackIndex = slotCount.get(key) ?? 0
      slotCount.set(key, stackIndex + 1)
      return { time: m.time, price: m.price, color: m.color, text: m.text, subtext: m.subtext, fontSize: 3, below: m.below, stackIndex }
    })
  }

  clearChartMarkers(chartTabId: string, panelId: string): void {
    const ctrl = this._findChartController(chartTabId, panelId)
    if (!ctrl) return
    ctrl.setConditionLabels([])
    if (ctrl.applyColorZones) ctrl.applyColorZones([])
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
