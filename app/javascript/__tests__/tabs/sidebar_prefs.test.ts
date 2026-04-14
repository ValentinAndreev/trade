import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_SIDEBAR_WIDTH_PX,
  clampSidebarWidth,
  loadSidebarPrefs,
  loadSidebarPrefsRecord,
  resetSidebarPrefsCache,
  saveSidebarPrefs,
  saveSidebarPrefsRecord,
  sidebarScopeForTabType,
} from "../../tabs/sidebar_prefs"

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: key => store.get(key) ?? null,
    key: index => Array.from(store.keys())[index] ?? null,
    removeItem: key => { store.delete(key) },
    setItem: (key, value) => { store.set(key, String(value)) },
  }
}

describe("sidebar_prefs", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", createLocalStorageMock())
    resetSidebarPrefsCache()
  })

  describe("load/save", () => {
    it("returns defaults for all scopes when storage is empty", () => {
      expect(loadSidebarPrefsRecord()).toEqual({
        chart: { widthPx: DEFAULT_SIDEBAR_WIDTH_PX, collapsed: false },
        data: { widthPx: DEFAULT_SIDEBAR_WIDTH_PX, collapsed: false },
        research: { widthPx: DEFAULT_SIDEBAR_WIDTH_PX, collapsed: false },
      })
    })

    it("persists prefs by scope independently", () => {
      saveSidebarPrefs("chart", { widthPx: 360, collapsed: false })
      saveSidebarPrefs("research", { widthPx: 480, collapsed: true })

      expect(loadSidebarPrefs("chart")).toEqual({ widthPx: 360, collapsed: false })
      expect(loadSidebarPrefs("data")).toEqual({ widthPx: DEFAULT_SIDEBAR_WIDTH_PX, collapsed: false })
      expect(loadSidebarPrefs("research")).toEqual({ widthPx: clampSidebarWidth(480, window.innerWidth), collapsed: true })
    })

    it("migrates legacy single-object prefs into every scope", () => {
      localStorage.setItem("chart-sidebar-prefs", JSON.stringify({ widthPx: 410, collapsed: true }))

      expect(loadSidebarPrefsRecord()).toEqual({
        chart: { widthPx: 410, collapsed: true },
        data: { widthPx: 410, collapsed: true },
        research: { widthPx: 410, collapsed: true },
      })
    })

    it("normalizes partial records when saving", () => {
      saveSidebarPrefsRecord({
        chart: { widthPx: 9999, collapsed: false },
        research: { widthPx: 250, collapsed: true },
      })

      const record = loadSidebarPrefsRecord()
      expect(record.chart.collapsed).toBe(false)
      expect(record.chart.widthPx).toBe(clampSidebarWidth(9999, window.innerWidth))
      expect(record.data).toEqual({ widthPx: DEFAULT_SIDEBAR_WIDTH_PX, collapsed: false })
      expect(record.research).toEqual({ widthPx: clampSidebarWidth(250, window.innerWidth), collapsed: true })
    })

    it("invalidates cached prefs when storage changes externally", () => {
      expect(loadSidebarPrefs("chart")).toEqual({ widthPx: DEFAULT_SIDEBAR_WIDTH_PX, collapsed: false })

      localStorage.setItem("chart-sidebar-prefs", JSON.stringify({
        chart: { widthPx: 372, collapsed: true },
        data: { widthPx: 415, collapsed: false },
        research: { widthPx: 488, collapsed: false },
      }))

      expect(loadSidebarPrefs("chart")).toEqual({ widthPx: 372, collapsed: true })
      expect(loadSidebarPrefs("data")).toEqual({ widthPx: 415, collapsed: false })
      expect(loadSidebarPrefs("research")).toEqual({ widthPx: clampSidebarWidth(488, window.innerWidth), collapsed: false })
    })
  })

  describe("sidebarScopeForTabType", () => {
    it("maps main workspace tabs to their scopes", () => {
      expect(sidebarScopeForTabType("chart")).toBe("chart")
      expect(sidebarScopeForTabType("data")).toBe("data")
      expect(sidebarScopeForTabType("research")).toBe("research")
    })

    it("falls back to chart scope for unsupported tab types", () => {
      expect(sidebarScopeForTabType("system_editor")).toBe("chart")
      expect(sidebarScopeForTabType("system_stats")).toBe("chart")
      expect(sidebarScopeForTabType(undefined)).toBe("chart")
    })
  })
})
