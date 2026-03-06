import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../services/connection_monitor", () => ({
  default: { isOnline: true, internetOnline: true, backendOnline: true },
}))
vi.mock("../../services/toast", () => ({
  showToast: vi.fn(),
}))

import { apiFetch } from "../../services/api_fetch"
import monitor from "../../services/connection_monitor"
import { showToast } from "../../services/toast"

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(showToast).mockClear()
    Object.defineProperty(monitor, "isOnline", { value: true, writable: true, configurable: true })
    monitor.internetOnline = true
    monitor.backendOnline = true
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns Response when online and fetch succeeds", async () => {
    const mockResponse = new Response("ok", { status: 200 })
    vi.mocked(fetch).mockResolvedValue(mockResponse)

    const result = await apiFetch("/api/test")
    expect(result).toBe(mockResponse)
    expect(fetch).toHaveBeenCalledWith("/api/test", {})
  })

  it("returns null and shows toast when fetch throws (non-silent)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"))

    const result = await apiFetch("/api/test")
    expect(result).toBeNull()
    expect(showToast).toHaveBeenCalledWith("Request failed — server may be unavailable")
  })

  it("returns null without toast when fetch throws (silent)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"))

    const result = await apiFetch("/api/test", {}, { silent: true })
    expect(result).toBeNull()
    expect(showToast).not.toHaveBeenCalled()
  })

  it("returns null and shows toast when offline (non-silent, no internet)", async () => {
    Object.defineProperty(monitor, "isOnline", { get: () => false, configurable: true })
    monitor.internetOnline = false

    const result = await apiFetch("/api/test")
    expect(result).toBeNull()
    expect(showToast).toHaveBeenCalledWith("No internet connection")
    expect(fetch).not.toHaveBeenCalled()

    Object.defineProperty(monitor, "isOnline", { value: true, writable: true, configurable: true })
  })

  it("returns null and shows 'Server unavailable' when backend offline", async () => {
    Object.defineProperty(monitor, "isOnline", { get: () => false, configurable: true })
    monitor.internetOnline = true
    monitor.backendOnline = false

    const result = await apiFetch("/api/test")
    expect(result).toBeNull()
    expect(showToast).toHaveBeenCalledWith("Server unavailable")

    Object.defineProperty(monitor, "isOnline", { value: true, writable: true, configurable: true })
  })

  it("returns null without toast when offline and silent", async () => {
    Object.defineProperty(monitor, "isOnline", { get: () => false, configurable: true })
    monitor.internetOnline = false

    const result = await apiFetch("/api/test", {}, { silent: true })
    expect(result).toBeNull()
    expect(showToast).not.toHaveBeenCalled()

    Object.defineProperty(monitor, "isOnline", { value: true, writable: true, configurable: true })
  })
})
