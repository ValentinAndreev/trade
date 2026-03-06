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
  savePreset, deletePreset, collectState, resetState,
} from "../../services/presets"

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
    it("returns tabs, activeTabId, and navPage", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("offline"))
      const result = await collectState() as any
      expect(result).toHaveProperty("tabs")
      expect(result).toHaveProperty("activeTabId")
      expect(result).toHaveProperty("navPage")
      expect(result.navPage).toBe("main")
    })

    it("includes server state when available", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ dashboardSymbols: ["BTC"], marketsSymbols: { forex: ["EUR"] } }), { status: 200 })
      )
      const result = await collectState() as any
      expect(result.dashboardSymbols).toEqual(["BTC"])
      expect(result.marketsSymbols).toEqual({ forex: ["EUR"] })
    })
  })

  describe("resetState", () => {
    it("clears localStorage keys", async () => {
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
