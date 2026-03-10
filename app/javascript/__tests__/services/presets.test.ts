import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../utils/api_helpers", () => ({
  csrfToken: () => "csrf",
  jsonHeaders: () => ({ "Content-Type": "application/json", "X-CSRF-Token": "csrf" }),
}))
vi.mock("../../tabs/persistence", () => ({
  loadTabs: vi.fn(() => []),
  saveTabs: vi.fn(),
  loadActiveTabId: vi.fn(() => null),
  saveActiveTabId: vi.fn(),
}))

import {
  getActivePreset, setActivePreset, listPresets,
  savePreset, deletePreset, collectState, applyState, resetState,
  PRESET_VERSION,
} from "../../services/presets"
import { saveTabs, saveActiveTabId } from "../../tabs/persistence"

describe("presets service", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.stubGlobal("fetch", vi.fn())
  })

  describe("getActivePreset / setActivePreset", () => {
    it("returns null when nothing stored", () => {
      expect(getActivePreset()).toBeNull()
    })

    it("stores and retrieves preset", () => {
      setActivePreset({ id: 1, name: "My Preset" })
      const result = getActivePreset()
      expect(result).toEqual({ id: 1, name: "My Preset" })
    })

    it("clears when set to null", () => {
      setActivePreset({ id: 1, name: "Test" })
      setActivePreset(null)
      expect(getActivePreset()).toBeNull()
    })

    it("returns null for invalid JSON", () => {
      localStorage.setItem("active-preset", "not-json{")
      expect(getActivePreset()).toBeNull()
    })
  })

  describe("listPresets", () => {
    it("returns array from API", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify([{ id: 1, name: "P1" }]), { status: 200 })
      )
      const result = await listPresets()
      expect(result).toEqual([{ id: 1, name: "P1" }])
    })

    it("returns empty array on failure", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 500 }))
      const result = await listPresets()
      expect(result).toEqual([])
    })
  })

  describe("savePreset", () => {
    it("uses POST for new preset (id=null)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ id: 5, name: "New" }), { status: 201 })
      )
      await savePreset(null, "New", { tabs: [] })
      expect(fetch).toHaveBeenCalledWith("/api/presets", expect.objectContaining({ method: "POST" }))
    })

    it("uses PATCH for existing preset", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ id: 3, name: "Updated" }), { status: 200 })
      )
      await savePreset(3, "Updated", { tabs: [] })
      expect(fetch).toHaveBeenCalledWith("/api/presets/3", expect.objectContaining({ method: "PATCH" }))
    })

    it("throws on error", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ errors: ["Invalid name"] }), { status: 422 })
      )
      await expect(savePreset(null, "", {})).rejects.toThrow("Invalid name")
    })
  })

  describe("deletePreset", () => {
    it("clears active preset if matching", async () => {
      setActivePreset({ id: 5, name: "ToDelete" })
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))

      await deletePreset(5)
      expect(getActivePreset()).toBeNull()
    })

    it("keeps active preset if not matching", async () => {
      setActivePreset({ id: 3, name: "Keep" })
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))

      await deletePreset(5)
      expect(getActivePreset()).toEqual({ id: 3, name: "Keep" })
    })
  })

  describe("collectState", () => {
    it("includes version, tabs, activeTabId and navPage", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("offline"))
      const result = await collectState()
      expect(result.version).toBe(PRESET_VERSION)
      expect(result).toHaveProperty("tabs")
      expect(result).toHaveProperty("activeTabId")
      expect(result.navPage).toBe("main")
    })

    it("reads navPage from localStorage", async () => {
      localStorage.setItem("nav-active-page", "chart")
      vi.mocked(fetch).mockRejectedValue(new Error("offline"))
      const result = await collectState()
      expect(result.navPage).toBe("chart")
    })

    it("includes server state when available", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ dashboardSymbols: ["BTC"], marketsSymbols: { forex: ["EUR"] } }), { status: 200 })
      )
      const result = await collectState()
      expect(result.dashboardSymbols).toEqual(["BTC"])
      expect(result.marketsSymbols).toEqual({ forex: ["EUR"] })
    })
  })

  describe("applyState", () => {
    beforeEach(() => {
      vi.stubGlobal("location", { reload: vi.fn() })
    })

    it("does nothing when payload is null", async () => {
      await applyState(null)
      expect(saveTabs).not.toHaveBeenCalled()
    })

    it("restores tabs and activeTabId", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }))
      const tabs = [{ id: "tab-1", name: null, type: "chart" as const, panels: [], primaryPanelId: "p-1" }]
      await applyState({ version: PRESET_VERSION, tabs, activeTabId: "tab-1", navPage: "main" })
      expect(saveTabs).toHaveBeenCalledWith(tabs)
      expect(saveActiveTabId).toHaveBeenCalledWith("tab-1")
    })

    it("restores navPage to localStorage", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }))
      await applyState({ version: PRESET_VERSION, tabs: [], activeTabId: null, navPage: "chart" })
      expect(localStorage.getItem("nav-active-page")).toBe("chart")
    })

    it("syncs server symbols when present", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }))
      await applyState({ version: PRESET_VERSION, tabs: [], activeTabId: null, navPage: "main", dashboardSymbols: ["BTC"] })
      expect(fetch).toHaveBeenCalledWith("/api/presets/apply_state", expect.objectContaining({ method: "POST" }))
    })
  })

  describe("resetState", () => {
    it("clears all localStorage keys", async () => {
      localStorage.setItem("chart-tabs", "[1]")
      localStorage.setItem("chart-active-tab", "tab-1")
      localStorage.setItem("nav-active-page", "chart")
      setActivePreset({ id: 1, name: "X" })
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))

      await resetState()
      expect(localStorage.getItem("chart-tabs")).toBeNull()
      expect(localStorage.getItem("chart-active-tab")).toBeNull()
      expect(localStorage.getItem("nav-active-page")).toBeNull()
      expect(getActivePreset()).toBeNull()
    })
  })
})
