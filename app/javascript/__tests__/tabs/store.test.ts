import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../tabs/persistence", () => ({
  loadTabs: vi.fn(() => []),
  saveTabs: vi.fn(),
  calcNextId: vi.fn(() => 1),
  loadActiveTabId: vi.fn(() => null),
  saveActiveTabId: vi.fn(),
}))
vi.mock("../../config/theme", () => ({
  OVERLAY_COLORS: Array.from({ length: 10 }, (_, i) => ({
    up: `#up${i}`, down: `#down${i}`, line: `#line${i}`,
  })),
}))

import TabStore from "../../tabs/store"

describe("TabStore", () => {
  let store: TabStore

  beforeEach(() => {
    vi.restoreAllMocks()
    store = new TabStore()
  })

  describe("tab CRUD", () => {
    it("starts with no tabs (empty persistence)", () => {
      expect(store.tabs).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
    })

    it("addTab creates a tab with panel and overlay", () => {
      const tab = store.addTab()
      expect(tab.id).toMatch(/^tab-/)
      expect(tab.panels).toHaveLength(1)
      expect(tab.panels[0].overlays).toHaveLength(1)
      expect(store.activeTabId).toBe(tab.id)
      expect(store.selectedPanelId).toBe(tab.panels[0].id)
      expect(store.selectedOverlayId).toBe(tab.panels[0].overlays[0].id)
    })

    it("addTab with symbol sets overlay symbol and tab name", () => {
      const tab = store.addTab({ symbol: "BTCUSD" })
      expect(tab.name).toBe("BTCUSD")
      expect(tab.panels[0].overlays[0].symbol).toBe("BTCUSD")
    })

    it("removeTab returns false when only one tab", () => {
      const tab = store.addTab()
      expect(store.removeTab(tab.id)).toBe(false)
      expect(store.tabs).toHaveLength(1)
    })

    it("removeTab deletes a tab and selects next", () => {
      const t1 = store.addTab()
      const t2 = store.addTab()
      expect(store.removeTab(t1.id)).toBe(true)
      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(t2.id)
    })

    it("activateTab switches active tab", () => {
      const t1 = store.addTab()
      const t2 = store.addTab()
      store.activateTab(t1.id)
      expect(store.activeTabId).toBe(t1.id)
    })

    it("activateTab returns false if already active", () => {
      const t1 = store.addTab()
      expect(store.activateTab(t1.id)).toBe(false)
    })

    it("renameTab updates tab name", () => {
      const tab = store.addTab()
      store.renameTab(tab.id, "Custom")
      expect(tab.name).toBe("Custom")
    })

    it("renameTab sets null for empty string", () => {
      const tab = store.addTab()
      store.renameTab(tab.id, "")
      expect(tab.name).toBeNull()
    })

    it("tabLabel returns name when set", () => {
      const tab = store.addTab({ symbol: "ETHUSD" })
      tab.name = "My Chart"
      expect(store.tabLabel(tab)).toBe("My Chart")
    })

    it("tabLabel falls back to symbol+timeframe", () => {
      const tab = store.addTab({ symbol: "ETHUSD" })
      tab.name = null
      expect(store.tabLabel(tab)).toBe("ETHUSD 1m")
    })

    it("tabLabel returns 'New' when no name or symbol", () => {
      const tab = store.addTab()
      tab.name = null
      tab.panels[0].overlays[0].symbol = null
      expect(store.tabLabel(tab)).toBe("New")
    })
  })

  describe("panel CRUD", () => {
    it("addPanel adds to active tab", () => {
      const tab = store.addTab()
      const panel = store.addPanel(tab.id)
      expect(panel).not.toBeNull()
      expect(tab.panels).toHaveLength(2)
      expect(store.selectedPanelId).toBe(panel!.id)
    })

    it("addPanel returns null for unknown tab", () => {
      expect(store.addPanel("nonexistent")).toBeNull()
    })

    it("removePanel auto-recreates when last panel is removed", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      store.removePanel(panelId)
      expect(tab.panels).toHaveLength(1)
      expect(tab.panels[0].id).not.toBe(panelId)
    })

    it("selectPanel changes selected panel", () => {
      const tab = store.addTab()
      const p2 = store.addPanel(tab.id)!
      store.selectPanel(tab.panels[0].id)
      expect(store.selectedPanelId).toBe(tab.panels[0].id)
    })

    it("selectPanel returns false if already selected", () => {
      const tab = store.addTab()
      expect(store.selectPanel(tab.panels[0].id)).toBe(false)
    })

    it("movePanelUp swaps panels", () => {
      const tab = store.addTab()
      store.addPanel(tab.id)
      const secondId = tab.panels[1].id
      store.movePanelUp(secondId)
      expect(tab.panels[0].id).toBe(secondId)
    })

    it("movePanelDown swaps panels", () => {
      const tab = store.addTab()
      store.addPanel(tab.id)
      const firstId = tab.panels[0].id
      store.movePanelDown(firstId)
      expect(tab.panels[1].id).toBe(firstId)
    })

    it("movePanelUp returns false for first panel", () => {
      const tab = store.addTab()
      expect(store.movePanelUp(tab.panels[0].id)).toBe(false)
    })

    it("updatePanelTimeframe changes timeframe", () => {
      const tab = store.addTab()
      store.updatePanelTimeframe(tab.panels[0].id, "5m")
      expect(tab.panels[0].timeframe).toBe("5m")
    })

    it("updatePanelTimeframe returns false if same", () => {
      const tab = store.addTab()
      expect(store.updatePanelTimeframe(tab.panels[0].id, "1m")).toBe(false)
    })
  })

  describe("overlay CRUD", () => {
    it("addOverlay adds to panel with color rotation", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      const o2 = store.addOverlay(panelId)
      expect(o2).not.toBeNull()
      expect(tab.panels[0].overlays).toHaveLength(2)
      expect(o2!.colorScheme).toBe(1)
    })

    it("addOverlay returns null for unknown panel", () => {
      expect(store.addOverlay("fake")).toBeNull()
    })

    it("removeOverlay auto-recreates when last removed", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      const overlayId = tab.panels[0].overlays[0].id
      store.removeOverlay(panelId, overlayId)
      expect(tab.panels[0].overlays).toHaveLength(1)
      expect(tab.panels[0].overlays[0].id).not.toBe(overlayId)
    })

    it("setOverlayMode changes mode", () => {
      const tab = store.addTab()
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayMode(oid, "volume")
      expect(tab.panels[0].overlays[0].mode).toBe("volume")
    })

    it("setOverlayMode to indicator sets defaults", () => {
      const tab = store.addTab({ symbol: "BTCUSD" })
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayMode(oid, "indicator")
      const overlay = tab.panels[0].overlays[0]
      expect(overlay.indicatorType).toBe("sma")
      expect(overlay.indicatorParams).toEqual({ period: 20 })
    })

    it("setOverlayColorScheme normalizes value", () => {
      const tab = store.addTab()
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayColorScheme(oid, 5)
      expect(tab.panels[0].overlays[0].colorScheme).toBe(5)
    })

    it("setOverlayOpacity normalizes to 0-1", () => {
      const tab = store.addTab()
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayOpacity(oid, 0.5)
      expect(tab.panels[0].overlays[0].opacity).toBe(0.5)
    })

    it("setOverlayVisible toggles visibility", () => {
      const tab = store.addTab()
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayVisible(oid, false)
      expect(tab.panels[0].overlays[0].visible).toBe(false)
    })

    it("setOverlayIndicatorType updates type", () => {
      const tab = store.addTab()
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayIndicatorType(oid, "ema")
      expect(tab.panels[0].overlays[0].indicatorType).toBe("ema")
    })

    it("setOverlayIndicatorType with source updates both", () => {
      const tab = store.addTab()
      const oid = tab.panels[0].overlays[0].id
      store.setOverlayIndicatorType(oid, "rsi", "server")
      expect(tab.panels[0].overlays[0].indicatorType).toBe("rsi")
      expect(tab.panels[0].overlays[0].indicatorSource).toBe("server")
    })
  })

  describe("drawing CRUD", () => {
    it("addDrawing creates item with prefixed ID", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      const item = store.addDrawing(panelId, "labels", { text: "hello" })
      expect(item).not.toBeNull()
      expect(item!.id).toMatch(/^lbl-/)
      expect(item!.text).toBe("hello")
    })

    it("removeDrawing removes item", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      const item = store.addDrawing(panelId, "lines", { name: "L1" })!
      expect(store.removeDrawing(panelId, "lines", item.id)).toBe(true)
      expect(tab.panels[0].lines).toHaveLength(0)
    })

    it("updateDrawing merges updates", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      const item = store.addDrawing(panelId, "hlines", { color: "red" })!
      store.updateDrawing(panelId, "hlines", item.id, { color: "blue" })
      expect(tab.panels[0].hlines![0].color).toBe("blue")
    })

    it("clearDrawings empties kind array", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      store.addDrawing(panelId, "vlines", {})
      store.addDrawing(panelId, "vlines", {})
      store.clearDrawings(panelId, "vlines")
      expect(tab.panels[0].vlines).toHaveLength(0)
    })

    it("clearAllDrawings empties all kinds", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      store.addDrawing(panelId, "labels", {})
      store.addDrawing(panelId, "lines", {})
      store.clearAllDrawings(panelId)
      expect(tab.panels[0].labels).toHaveLength(0)
      expect(tab.panels[0].lines).toHaveLength(0)
    })
  })

  describe("volume profile", () => {
    it("setVolumeProfile enables with defaults", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      store.setVolumeProfile(panelId, { enabled: true })
      expect(tab.panels[0].volumeProfile).toEqual({ enabled: true, opacity: 0.3 })
    })

    it("setVolumeProfile merges with existing", () => {
      const tab = store.addTab()
      const panelId = tab.panels[0].id
      store.setVolumeProfile(panelId, { enabled: true })
      store.setVolumeProfile(panelId, { opacity: 0.7 })
      expect(tab.panels[0].volumeProfile).toEqual({ enabled: true, opacity: 0.7 })
    })
  })
})
