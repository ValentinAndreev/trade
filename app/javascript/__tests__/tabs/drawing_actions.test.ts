import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../config/theme", () => ({
  OVERLAY_COLORS: Array.from({ length: 10 }, (_, i) => ({
    up: `#up${i}`, down: `#down${i}`, line: `#line${i}`,
  })),
}))
vi.mock("../../tabs/persistence", () => ({
  loadTabs: vi.fn(() => []),
  saveTabs: vi.fn(),
  calcNextId: vi.fn(() => 1),
  loadActiveTabId: vi.fn(() => null),
  saveActiveTabId: vi.fn(),
}))

import DrawingActions from "../../tabs/drawing_actions"
import TabStore from "../../tabs/store"

describe("DrawingActions", () => {
  let store: TabStore
  let actions: DrawingActions
  let mockChartCtrl: any
  let renderSpy: ReturnType<typeof vi.fn>
  let panelId: string

  beforeEach(() => {
    store = new TabStore()
    const tab = store.addTab({ symbol: "BTCUSD" })
    panelId = tab.panels[0].id

    mockChartCtrl = {
      setLabels: vi.fn(), setLines: vi.fn(), setHLines: vi.fn(), setVLines: vi.fn(),
      enterLabelMode: vi.fn(), exitLabelMode: vi.fn(),
      enterLineMode: vi.fn(), exitLineMode: vi.fn(),
      enterHLineMode: vi.fn(), exitHLineMode: vi.fn(),
      enterVLineMode: vi.fn(), exitVLineMode: vi.fn(),
      scrollToLabel: vi.fn(), scrollToLine: vi.fn(),
    }
    renderSpy = vi.fn()

    actions = new DrawingActions(
      store,
      () => store.selectedPanel,
      () => mockChartCtrl,
      renderSpy,
    )
  })

  describe("toggleMode", () => {
    it("enables a drawing mode", () => {
      actions.toggleMode("labels")
      expect(actions.modes.labels).toBe(true)
      expect(mockChartCtrl.enterLabelMode).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
    })

    it("disables a drawing mode on second toggle", () => {
      actions.toggleMode("labels")
      actions.toggleMode("labels")
      expect(actions.modes.labels).toBe(false)
      expect(mockChartCtrl.exitLabelMode).toHaveBeenCalled()
    })

    it("exits other modes when enabling a new one", () => {
      actions.toggleMode("labels")
      actions.toggleMode("lines")
      expect(actions.modes.labels).toBe(false)
      expect(actions.modes.lines).toBe(true)
      expect(mockChartCtrl.exitLabelMode).toHaveBeenCalled()
      expect(mockChartCtrl.enterLineMode).toHaveBeenCalled()
    })
  })

  describe("removeItem", () => {
    it("removes a drawing and syncs to chart", () => {
      const item = store.addDrawing(panelId, "labels", { text: "test" })!
      actions.removeItem("labels", item.id)
      expect(mockChartCtrl.setLabels).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
    })

    it("does nothing for invalid item", () => {
      actions.removeItem("labels", "invalid-id")
      expect(mockChartCtrl.setLabels).not.toHaveBeenCalled()
    })
  })

  describe("clearAll", () => {
    it("clears all drawings of a kind and syncs chart", () => {
      store.addDrawing(panelId, "lines", { name: "L1" })
      store.addDrawing(panelId, "lines", { name: "L2" })
      actions.clearAll("lines")
      expect(mockChartCtrl.setLines).toHaveBeenCalledWith([])
      expect(renderSpy).toHaveBeenCalled()
    })

    it("does nothing when no drawings exist", () => {
      actions.clearAll("hlines")
      expect(mockChartCtrl.setHLines).not.toHaveBeenCalled()
    })
  })

  describe("onCreated", () => {
    it("adds a drawing via store and syncs", () => {
      const panel = store.selectedPanel!
      actions.onCreated("labels", panel, { text: "new label", time: 1000 })
      expect(panel.labels).toHaveLength(1)
      expect(panel.labels![0].text).toBe("new label")
      expect(mockChartCtrl.setLabels).toHaveBeenCalled()
    })

    it("does nothing for null panel", () => {
      actions.onCreated("labels", null, { text: "nope" })
      expect(mockChartCtrl.setLabels).not.toHaveBeenCalled()
    })
  })

  describe("changeColor", () => {
    it("updates drawing color and syncs", () => {
      const item = store.addDrawing(panelId, "hlines", { color: "red" })!
      actions.changeColor("hlines", item.id, "blue")
      expect(store.selectedPanel!.hlines![0].color).toBe("blue")
      expect(mockChartCtrl.setHLines).toHaveBeenCalled()
    })
  })

  describe("changeWidth", () => {
    it("updates drawing width and syncs", () => {
      const item = store.addDrawing(panelId, "lines", { width: 1 })!
      actions.changeWidth("lines", item.id, 3)
      expect(store.selectedPanel!.lines![0].width).toBe(3)
    })

    it("ignores NaN width", () => {
      const item = store.addDrawing(panelId, "lines", { width: 1 })!
      actions.changeWidth("lines", item.id, NaN)
      expect(store.selectedPanel!.lines![0].width).toBe(1)
    })
  })
})
