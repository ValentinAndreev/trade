import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("../../config/theme", () => ({
  OVERLAY_COLORS: Array.from({ length: 10 }, (_, i) => ({
    up: `#up${i}`, down: `#down${i}`, line: `#line${i}`,
  })),
}))

import { loadTabs, saveTabs, loadActiveTabId, saveActiveTabId, calcNextId } from "../../tabs/persistence"
import type { Tab } from "../../types/store"

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe("loadTabs", () => {
    it("returns empty array when nothing stored", () => {
      expect(loadTabs()).toEqual([])
    })

    it("parses valid JSON tabs", () => {
      const tabs: Tab[] = [{
        id: "tab-1",
        name: "Test",
        panels: [{
          id: "p-1",
          timeframe: "1m",
          overlays: [{
            id: "o-1", symbol: "BTCUSD", mode: "price",
            chartType: "Candlestick", visible: true,
            colorScheme: 0, opacity: 1,
            indicatorType: null, indicatorParams: null, pinnedTo: null,
          }],
        }],
      }]
      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("tab-1")
      expect(result[0].panels[0].overlays[0].symbol).toBe("BTCUSD")
    })

    it("returns default for invalid JSON", () => {
      localStorage.setItem("chart-tabs", "{broken")
      expect(loadTabs()).toEqual([])
    })

    it("migrates old tab format (no panels)", () => {
      const oldTabs = [{ id: "tab-1", symbol: "ETHUSD", timeframe: "5m", mode: "price", name: "ETH" }]
      localStorage.setItem("chart-tabs", JSON.stringify(oldTabs))
      const result = loadTabs()
      expect(result[0].panels).toHaveLength(1)
      expect(result[0].panels[0].overlays[0].symbol).toBe("ETHUSD")
      expect(result[0].panels[0].timeframe).toBe("5m")
    })

    it("migrates old panel format (no overlays)", () => {
      const oldTabs = [{
        id: "tab-1",
        name: null,
        panels: [{ id: "p-1", symbol: "SOLUSD", timeframe: "15m", mode: "price" }],
      }]
      localStorage.setItem("chart-tabs", JSON.stringify(oldTabs))
      const result = loadTabs()
      expect(result[0].panels[0].overlays).toHaveLength(1)
      expect(result[0].panels[0].overlays[0].symbol).toBe("SOLUSD")
    })
  })

  describe("saveTabs", () => {
    it("serializes to localStorage", () => {
      const tabs: Tab[] = [{
        id: "tab-1", name: null,
        panels: [{ id: "p-1", timeframe: "1m", overlays: [] }],
      }]
      saveTabs(tabs)
      expect(JSON.parse(localStorage.getItem("chart-tabs")!)).toEqual(tabs)
    })
  })

  describe("loadActiveTabId / saveActiveTabId", () => {
    it("returns null when not set", () => {
      expect(loadActiveTabId()).toBeNull()
    })

    it("stores and retrieves tab id", () => {
      saveActiveTabId("tab-5")
      expect(loadActiveTabId()).toBe("tab-5")
    })
  })

  describe("calcNextId", () => {
    it("returns 1 for empty tabs", () => {
      expect(calcNextId([], "p")).toBe(1)
      expect(calcNextId([], "o")).toBe(1)
    })

    it("finds max panel id", () => {
      const tabs: Tab[] = [{
        id: "tab-1", name: null,
        panels: [
          { id: "p-3", timeframe: "1m", overlays: [{ id: "o-1", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null }] },
          { id: "p-7", timeframe: "1m", overlays: [{ id: "o-2", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null }] },
        ],
      }]
      expect(calcNextId(tabs, "p")).toBe(8)
    })

    it("finds max overlay id", () => {
      const tabs: Tab[] = [{
        id: "tab-1", name: null,
        panels: [
          { id: "p-1", timeframe: "1m", overlays: [
            { id: "o-5", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null },
            { id: "o-12", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null },
          ] },
        ],
      }]
      expect(calcNextId(tabs, "o")).toBe(13)
    })
  })
})
