import { createInlineRenameInput } from "../utils/dom"
import type TabStore from "./store"
import type { Panel, DrawingKind, DrawingItem, ChartControllerAPI, LabelMarkerInput } from "../types/store"

type Ctrl = ChartControllerAPI
const CHART_METHODS: Record<DrawingKind, {
  enter(ctrl: Ctrl): void
  exit(ctrl: Ctrl): void
  set(ctrl: Ctrl, items: DrawingItem[]): void
  scroll(ctrl: Ctrl, time: number): void
}> = {
  labels: {
    enter: c => c.enterLabelMode(),
    exit:  c => c.exitLabelMode(),
    set:   (c, items) => c.setLabels(items as unknown as LabelMarkerInput[]),
    scroll:(c, time)  => c.scrollToLabel(time),
  },
  lines: {
    enter: c => c.enterLineMode(),
    exit:  c => c.exitLineMode(),
    set:   (c, items) => c.setLines(items),
    scroll:(c, time)  => c.scrollToLine(time),
  },
  hlines: {
    enter: c => c.enterHLineMode(),
    exit:  c => c.exitHLineMode(),
    set:   (c, items) => c.setHLines(items),
    scroll:(c, time)  => c.scrollToLabel(time),
  },
  vlines: {
    enter: c => c.enterVLineMode(),
    exit:  c => c.exitVLineMode(),
    set:   (c, items) => c.setVLines(items),
    scroll:(c, time)  => c.scrollToLabel(time),
  },
}

const NAME_KEYS = { labels: "text", lines: "name", hlines: "name", vlines: "name" }

export default class DrawingActions {
  store: TabStore
  _getPanel: () => Panel | null
  _getChartCtrl: (panelId: string) => ChartControllerAPI | null
  _render: () => void
  modes: Record<DrawingKind, boolean>

  constructor(
    store: TabStore,
    getPanel: () => Panel | null,
    getChartCtrl: (panelId: string) => ChartControllerAPI | null,
    render: () => void
  ) {
    this.store = store
    this._getPanel = getPanel
    this._getChartCtrl = getChartCtrl
    this._render = render
    this.modes = { labels: false, lines: false, hlines: false, vlines: false }
  }

  toggleMode(kind: DrawingKind): void {
    this.modes[kind] = !this.modes[kind]
    const panel = this._getPanel()
    const chartCtrl = panel ? this._getChartCtrl(panel.id) : null
    if (this.modes[kind]) {
      this.exitOtherModes(kind, chartCtrl)
      if (chartCtrl) CHART_METHODS[kind].enter(chartCtrl)
    } else {
      if (chartCtrl) CHART_METHODS[kind].exit(chartCtrl)
    }
    this._render()
  }

  removeItem(kind: DrawingKind, itemId: string): void {
    const panel = this._getPanel()
    if (!panel || !itemId) return
    if (this.store.removeDrawing(panel.id, kind, itemId)) {
      this.syncToChart(kind)
      this._render()
    }
  }

  startRename(kind: DrawingKind, itemId: string, row: HTMLElement): void {
    const panel = this._getPanel()
    if (!panel || !itemId) return

    const nameKey = NAME_KEYS[kind] || "name"
    const items = panel[kind] || []
    const item = items.find(i => i.id === itemId)
    if (!item) return

    const nameSpan = row.querySelector(`[data-drawing-name="${itemId}"]`)
    if (!nameSpan) return

    const currentText = String(item[nameKey] ?? item.id)
    const input = createInlineRenameInput(currentText, (text: string) => {
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

  changeColor(kind: DrawingKind, itemId: string, color: string): void {
    const panel = this._getPanel()
    if (!panel || !itemId) return
    this.store.updateDrawing(panel.id, kind, itemId, { color })
    this.syncToChart(kind)
    this._render()
  }

  changeWidth(kind: DrawingKind, itemId: string, width: number): void {
    const panel = this._getPanel()
    if (!panel || !itemId || !Number.isFinite(width)) return
    this.store.updateDrawing(panel.id, kind, itemId, { width })
    this.syncToChart(kind)
    this._render()
  }

  changeFontSize(kind: DrawingKind, itemId: string, fontSize: number): void {
    const panel = this._getPanel()
    if (!panel || !itemId || !Number.isFinite(fontSize)) return
    this.store.updateDrawing(panel.id, kind, itemId, { fontSize })
    this.syncToChart(kind)
    this._render()
  }

  clearAll(kind: DrawingKind): void {
    const panel = this._getPanel()
    if (!panel || !panel[kind]?.length) return
    this.store.clearDrawings(panel.id, kind)
    const chartCtrl = this._getChartCtrl(panel.id)
    if (chartCtrl) CHART_METHODS[kind].set(chartCtrl, [])
    this._render()
  }

  selectItem(kind: DrawingKind, itemId: string): void {
    const panel = this._getPanel()
    if (!panel || !itemId) return
    const item = (panel[kind] || []).find(i => i.id === itemId)
    if (!item) return
    const chartCtrl = this._getChartCtrl(panel.id)
    if (!chartCtrl) return

    if (kind === "labels") CHART_METHODS.labels.scroll(chartCtrl, item.time as number)
    else if (kind === "lines") CHART_METHODS.lines.scroll(chartCtrl, item.p1 as number)
    else if (kind === "vlines") CHART_METHODS.vlines.scroll(chartCtrl, item.time as number)
  }

  syncToChart(kind: DrawingKind): void {
    const panel = this._getPanel()
    if (!panel) return
    const chartCtrl = this._getChartCtrl(panel.id)
    if (!chartCtrl) return
    CHART_METHODS[kind].set(chartCtrl, panel[kind] || [])
  }

  onCreated(kind: DrawingKind, panel: Panel | null, detail: Partial<DrawingItem>): void {
    if (!panel) return
    const item = this.store.addDrawing(panel.id, kind, detail)
    if (item) {
      this.syncToChart(kind)
      this._render()
    }
  }

  exitOtherModes(except: DrawingKind, chartCtrl: ChartControllerAPI | null): void {
    for (const kind of Object.keys(this.modes) as DrawingKind[]) {
      if (kind !== except && this.modes[kind]) {
        this.modes[kind] = false
        if (chartCtrl) CHART_METHODS[kind].exit(chartCtrl)
      }
    }
  }

  syncAllModesToChart(chartCtrl: ChartControllerAPI | null): void {
    if (!chartCtrl) return
    for (const kind of Object.keys(this.modes) as DrawingKind[]) {
      if (this.modes[kind]) CHART_METHODS[kind].enter(chartCtrl)
      else CHART_METHODS[kind].exit(chartCtrl)
    }
  }
}
