import { describe, it, expect, beforeEach, vi } from "vitest"

import { loadTabs, saveTabs, loadActiveTabId, saveActiveTabId, calcNextId } from "../../tabs/persistence"
import type { Tab } from "../../types/store"

describe("persistence", () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
      clear: () => { storage.clear() },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size },
    })
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

    it("preserves persisted ML prediction data columns", () => {
      const tabs: Tab[] = [{
        id: "tab-1",
        name: "Data: BTCUSD",
        type: "data",
        panels: [],
        dataConfig: {
          symbols: ["BTCUSD"],
          timeframe: "1h",
          columns: [{
            id: "col-ml",
            type: "ml_prediction",
            label: "ML probability",
            modelKey: "btc_direction_v1",
            modelOutput: "probability",
          }],
          conditions: [],
          systems: [],
          chartLinks: [],
        },
      }]
      localStorage.setItem("chart-tabs", JSON.stringify(tabs))

      expect(loadTabs()).toEqual(tabs)
    })

    it("hydrates missing research config for persisted research tabs", () => {
      const tabs = [{
        id: "tab-1",
        name: "Test/Optimization",
        type: "research",
        panels: [],
      }]
      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()
      expect(result[0].type).toBe("research")
      expect(result[0].researchConfig?.systemId).toBe("price_ema_cross")
      expect(result[0].researchConfig?.systemYaml).toBe("")
      expect(result[0].researchConfig?.topPaneExpanded).toBeNull()
    })

    it("hydrates missing research result for persisted research tabs", () => {
      const tabs = [{
        id: "tab-1",
        name: "Test/Optimization",
        type: "research",
        panels: [],
        researchConfig: {
          symbol: "BTCUSD",
          timeframe: "1h",
          startTime: "2026-03-01T00:00",
          endTime: "2026-03-10T00:00",
          systemId: "price_ema_cross",
          systemPath: "trend/price_ema_cross.yml",
          systemYaml: "id: price_ema_cross",
          feeBps: 4,
          slippageBps: 2,
          optimizationEnabled: false,
          optimizationTarget: "ema.period",
          optimizationFrom: 5,
          optimizationTo: 50,
          optimizationStep: 1,
          selectedMetric: "sharpeRatio",
          resultsSplitRatio: 0.38,
          topPaneExpanded: null,
        },
      }]
      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()
      expect(result[0].researchResult).toEqual({ runs: [], selectedRunIndex: 0 })
    })

    it("hydrates missing system editor config for persisted editor tabs", () => {
      const tabs = [{
        id: "tab-1",
        name: "System editor",
        type: "system_editor",
        panels: [],
      }]

      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()

      expect(result[0].type).toBe("system_editor")
      expect(result[0].systemEditorConfig?.systemId).toBe("custom_system")
      expect(result[0].systemEditorConfig?.sourceSystemId).toBeNull()
      expect(result[0].systemEditorConfig?.systemYaml).toBe("")
    })

    it("hydrates missing ML models config for persisted ML tabs", () => {
      const tabs = [{
        id: "tab-1",
        name: "ML models",
        type: "ml_models",
        panels: [],
      }]

      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()

      expect(result[0].type).toBe("ml_models")
      expect(result[0].mlModelsConfig).toEqual({ selectedModelKey: null })
    })

    it("deduplicates persisted ML models tabs", () => {
      const tabs = [
        { id: "tab-1", name: "ML models", type: "ml_models", panels: [], mlModelsConfig: { selectedModelKey: "a" } },
        { id: "tab-2", name: "ML models 2", type: "ml_models", panels: [], mlModelsConfig: { selectedModelKey: "b" } },
      ]

      localStorage.setItem("chart-tabs", JSON.stringify(tabs))
      const result = loadTabs()

      expect(result.filter(tab => tab.type === "ml_models")).toHaveLength(1)
      expect(result[0].mlModelsConfig).toEqual({ selectedModelKey: "a" })
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

    it("omits heavy research results from persisted tabs", () => {
      const tabs: Tab[] = [{
        id: "tab-1",
        name: "Test/Optimization",
        type: "research",
        panels: [],
        researchConfig: {
          symbol: "BTCUSD",
          timeframe: "1h",
          startTime: "2026-03-01T00:00",
          endTime: "2026-03-10T00:00",
          systemId: "price_ema_cross",
          systemPath: "trend/price_ema_cross.yml",
          systemYaml: "id: price_ema_cross",
          feeBps: 4,
          slippageBps: 2,
          optimizationEnabled: false,
          optimizationTarget: "ema.period",
          optimizationFrom: 5,
          optimizationTo: 50,
          optimizationStep: 1,
          selectedMetric: "sharpeRatio",
          resultsSplitRatio: 0.38,
          topPaneExpanded: null,
        },
        researchResult: {
          runs: [{ params: { ema_period: 20 }, trades: [] }],
          selectedRunIndex: 0,
        },
      }]

      saveTabs(tabs)
      const stored = JSON.parse(localStorage.getItem("chart-tabs")!)
      expect(stored[0].researchResult).toBeUndefined()
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
