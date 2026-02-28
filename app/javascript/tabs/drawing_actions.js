// Generic drawing actions extracted from tabs_controller.js
// Handles labels, lines, hlines, vlines with a unified interface.

import { createInlineRenameInput } from "../utils/dom"

const CHART_METHODS = {
  labels: { set: "setLabels", scroll: "scrollToLabel", enter: "enterLabelMode", exit: "exitLabelMode" },
  lines:  { set: "setLines",  scroll: "scrollToLine",  enter: "enterLineMode",  exit: "exitLineMode" },
  hlines: { set: "setHLines", scroll: "scrollToLabel",  enter: "enterHLineMode", exit: "exitHLineMode" },
  vlines: { set: "setVLines", scroll: "scrollToLabel",  enter: "enterVLineMode", exit: "exitVLineMode" },
}

const NAME_KEYS = { labels: "text", lines: "name", hlines: "name", vlines: "name" }

export default class DrawingActions {
  constructor(store, getPanel, getChartCtrl, render) {
    this.store = store
    this._getPanel = getPanel
    this._getChartCtrl = getChartCtrl
    this._render = render
    this.modes = { labels: false, lines: false, hlines: false, vlines: false }
  }

  toggleMode(kind) {
    this.modes[kind] = !this.modes[kind]
    const panel = this._getPanel()
    const chartCtrl = panel ? this._getChartCtrl(panel.id) : null
    if (this.modes[kind]) {
      this.exitOtherModes(kind, chartCtrl)
      if (chartCtrl) chartCtrl[CHART_METHODS[kind].enter]()
    } else {
      if (chartCtrl) chartCtrl[CHART_METHODS[kind].exit]()
    }
    this._render()
  }

  removeItem(kind, itemId) {
    const panel = this._getPanel()
    if (!panel || !itemId) return
    if (this.store.removeDrawing(panel.id, kind, itemId)) {
      this.syncToChart(kind)
      this._render()
    }
  }

  startRename(kind, itemId, row) {
    const panel = this._getPanel()
    if (!panel || !itemId) return

    const nameKey = NAME_KEYS[kind] || "name"
    const items = panel[kind] || []
    const item = items.find(i => i.id === itemId)
    if (!item) return

    const nameSpan = row.querySelector(`[data-drawing-name="${itemId}"]`)
    if (!nameSpan) return

    const currentText = item[nameKey] || item.id
    const input = createInlineRenameInput(currentText, (text) => {
      if (text && text !== item[nameKey]) {
        this.store.updateDrawing(panel.id, kind, itemId, { [nameKey]: text })
        this.syncToChart(kind)
      }
      this._render()
    })

    nameSpan.textContent = ""
    nameSpan.appendChild(input)
    input.focus()
    input.select()
  }

  changeColor(kind, itemId, color) {
    const panel = this._getPanel()
    if (!panel || !itemId) return
    this.store.updateDrawing(panel.id, kind, itemId, { color })
    this.syncToChart(kind)
    this._render()
  }

  changeWidth(kind, itemId, width) {
    const panel = this._getPanel()
    if (!panel || !itemId || !Number.isFinite(width)) return
    this.store.updateDrawing(panel.id, kind, itemId, { width })
    this.syncToChart(kind)
    this._render()
  }

  changeFontSize(kind, itemId, fontSize) {
    const panel = this._getPanel()
    if (!panel || !itemId || !Number.isFinite(fontSize)) return
    this.store.updateDrawing(panel.id, kind, itemId, { fontSize })
    this.syncToChart(kind)
    this._render()
  }

  clearAll(kind) {
    const panel = this._getPanel()
    if (!panel || !panel[kind]?.length) return
    this.store.clearDrawings(panel.id, kind)
    const chartCtrl = this._getChartCtrl(panel.id)
    if (chartCtrl) chartCtrl[CHART_METHODS[kind].set]([])
    this._render()
  }

  selectItem(kind, itemId) {
    const panel = this._getPanel()
    if (!panel || !itemId) return
    const item = (panel[kind] || []).find(i => i.id === itemId)
    if (!item) return
    const chartCtrl = this._getChartCtrl(panel.id)
    if (!chartCtrl) return

    const scrollMethod = CHART_METHODS[kind].scroll
    if (kind === "labels") {
      chartCtrl[scrollMethod](item.time)
    } else if (kind === "lines") {
      chartCtrl[scrollMethod](item.p1)
    } else if (kind === "vlines") {
      chartCtrl[scrollMethod](item.time)
    }
  }

  syncToChart(kind) {
    const panel = this._getPanel()
    if (!panel) return
    const chartCtrl = this._getChartCtrl(panel.id)
    if (!chartCtrl) return
    chartCtrl[CHART_METHODS[kind].set](panel[kind] || [])
  }

  onCreated(kind, panel, detail) {
    if (!panel) return
    const item = this.store.addDrawing(panel.id, kind, detail)
    if (item) {
      this.syncToChart(kind)
      this._render()
    }
  }

  exitOtherModes(except, chartCtrl) {
    for (const kind of Object.keys(this.modes)) {
      if (kind !== except && this.modes[kind]) {
        this.modes[kind] = false
        if (chartCtrl) chartCtrl[CHART_METHODS[kind].exit]()
      }
    }
  }

  syncAllModesToChart(chartCtrl) {
    if (!chartCtrl) return
    for (const kind of Object.keys(this.modes)) {
      if (this.modes[kind]) {
        chartCtrl[CHART_METHODS[kind].enter]()
      } else {
        chartCtrl[CHART_METHODS[kind].exit]()
      }
    }
  }
}
