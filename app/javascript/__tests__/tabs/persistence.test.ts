import { describe, it, expect, beforeEach } from "vitest"

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
        type: "chart",
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
      expect(result[0].type).toBe("chart")
      expect(result[0].panels[0].overlays[0].symbol).toBe("BTCUSD")
    })

    it("returns default for invalid JSON", () => {
      localStorage.setItem("chart-tabs", "{broken")
      expect(loadTabs()).toEqual([])
    })

    it("preserves data tab type", () => {
      const tabs = [{
        id: "tab-1",
        name: "Data: BTCUSD",
        type: "data",
        panels: [],
        dataConfig: { symbols: ["BTCUSD"], timeframe: "1h", columns: [], conditions: [], chartLinks: [] },
      }]
      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()
      expect(result[0].type).toBe("data")
      expect(result[0].dataConfig?.symbols).toEqual(["BTCUSD"])
    })
  })

  describe("saveTabs", () => {
    it("serializes to localStorage", () => {
      const tabs: Tab[] = [{
        id: "tab-1", name: null, type: "chart",
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
        id: "tab-1", name: null, type: "chart",
        panels: [
          { id: "p-3", timeframe: "1m", overlays: [{ id: "o-1", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null }] },
          { id: "p-7", timeframe: "1m", overlays: [{ id: "o-2", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null }] },
        ],
      }]
      expect(calcNextId(tabs, "p")).toBe(8)
    })

    it("finds max overlay id", () => {
      const tabs: Tab[] = [{
        id: "tab-1", name: null, type: "chart",
        panels: [
          { id: "p-1", timeframe: "1m", overlays: [
            { id: "o-5", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null },
            { id: "o-12", symbol: null, mode: "price", chartType: "Line", visible: true, colorScheme: 0, opacity: 1, indicatorType: null, indicatorParams: null, pinnedTo: null },
          ] },
        ],
      }]
      expect(calcNextId(tabs, "o")).toBe(13)
    })

    it("skips data tabs for panel/overlay IDs", () => {
      const tabs: Tab[] = [{
        id: "tab-1", name: null, type: "data",
        panels: [],
        dataConfig: { symbols: [], timeframe: "1m", columns: [], conditions: [], chartLinks: [] },
      }]
      expect(calcNextId(tabs, "p")).toBe(1)
      expect(calcNextId(tabs, "o")).toBe(1)
    })
  })
})
