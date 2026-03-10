import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../services/toast", () => ({ showToast: vi.fn() }))
vi.mock("../../config/constants", () => ({
  PING_INTERVAL_MS: 5000,
  PING_TIMEOUT_MS: 3000,
  CONNECTION_ONLINE_COLOR: "#22c55e",
  CONNECTION_OFFLINE_COLOR: "#ef4444",
  CONNECTION_EXCHANGE_OFFLINE_COLOR: "#f59e0b",
}))
vi.mock("../../chart/feeds/cable_consumer", () => ({
  consumer: {
    subscriptions: {
      create: vi.fn(() => ({ unsubscribe: vi.fn() })),
    },
  },
}))

describe("ConnectionMonitor", () => {
  let monitor: any

  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.stubGlobal("fetch", vi.fn())
    vi.useFakeTimers()
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true })

    const mod = await import("../../services/connection_monitor")
    monitor = mod.default
    monitor.backendOnline = true
    monitor.internetOnline = true
    monitor.bitfinexReachable = true
    monitor._started = false
    monitor._interval = null
    monitor._subscription = null
  })

  afterEach(() => {
    monitor.stop()
    vi.useRealTimers()
  })

  describe("isOnline", () => {
    it("returns true when both backend and internet are online", () => {
      monitor.backendOnline = true
      monitor.internetOnline = true
      expect(monitor.isOnline).toBe(true)
    })

    it("returns false when backend is offline", () => {
      monitor.backendOnline = false
      monitor.internetOnline = true
      expect(monitor.isOnline).toBe(false)
    })

    it("returns false when internet is offline", () => {
      monitor.backendOnline = true
      monitor.internetOnline = false
      expect(monitor.isOnline).toBe(false)
    })
  })

  describe("requireOnline", () => {
    it("returns true when online", () => {
      expect(monitor.requireOnline("save")).toBe(true)
    })

    it("returns false and shows toast when offline", async () => {
      monitor.backendOnline = false
      const { showToast } = await import("../../services/toast")

      expect(monitor.requireOnline("save")).toBe(false)
      expect(showToast).toHaveBeenCalledWith("Server unavailable — cannot save")
    })

    it("shows 'No internet' when internet offline", async () => {
      monitor.internetOnline = false
      const { showToast } = await import("../../services/toast")

      monitor.requireOnline("load")
      expect(showToast).toHaveBeenCalledWith("No internet connection — cannot load")
    })
  })

  describe("_ping", () => {
    it("sets backendOnline to true on successful ping", async () => {
      monitor.backendOnline = false
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))

      await monitor._ping()
      expect(monitor.backendOnline).toBe(true)
    })

    it("sets backendOnline to false on failed ping", async () => {
      monitor.backendOnline = true
      vi.mocked(fetch).mockRejectedValue(new Error("network"))

      await monitor._ping()
      expect(monitor.backendOnline).toBe(false)
    })

    it("dispatches connection:change event on state change", async () => {
      monitor.backendOnline = true
      vi.mocked(fetch).mockRejectedValue(new Error("down"))

      const spy = vi.fn()
      window.addEventListener("connection:change", spy)

      await monitor._ping()
      expect(spy).toHaveBeenCalled()
      expect((spy.mock.calls[0][0] as CustomEvent).detail.online).toBe(false)

      window.removeEventListener("connection:change", spy)
    })

    it("skips fetch when internet is offline", async () => {
      monitor.internetOnline = false
      monitor.backendOnline = true

      await monitor._ping()
      expect(fetch).not.toHaveBeenCalled()
      expect(monitor.backendOnline).toBe(false)
    })

    it("updates bitfinexReachable from JSON response", async () => {
      monitor.bitfinexReachable = true
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ bitfinex: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )

      await monitor._ping()
      expect(monitor.bitfinexReachable).toBe(false)
    })

    it("keeps bitfinexReachable true when JSON says true", async () => {
      monitor.bitfinexReachable = false
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ bitfinex: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )

      await monitor._ping()
      expect(monitor.bitfinexReachable).toBe(true)
    })

    it("ignores non-JSON health responses gracefully", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))
      await expect(monitor._ping()).resolves.not.toThrow()
      expect(monitor.bitfinexReachable).toBe(true)
    })
  })

  describe("_updateBitfinexStatus", () => {
    it("emits exchange:change event when status changes", async () => {
      const spy = vi.fn()
      window.addEventListener("exchange:change", spy)

      monitor._updateBitfinexStatus(false)
      expect(spy).toHaveBeenCalled()
      expect((spy.mock.calls[0][0] as CustomEvent).detail.bitfinex).toBe(false)

      window.removeEventListener("exchange:change", spy)
    })

    it("shows toast when bitfinex becomes unreachable", async () => {
      const { showToast } = await import("../../services/toast")
      monitor.bitfinexReachable = true
      monitor._updateBitfinexStatus(false)
      expect(showToast).toHaveBeenCalledWith("Bitfinex unreachable — live data paused")
    })

    it("shows toast when bitfinex reconnects", async () => {
      const { showToast } = await import("../../services/toast")
      monitor.bitfinexReachable = false
      monitor._updateBitfinexStatus(true)
      expect(showToast).toHaveBeenCalledWith("Bitfinex reconnected")
    })

    it("does nothing when status unchanged", async () => {
      const spy = vi.fn()
      window.addEventListener("exchange:change", spy)

      monitor.bitfinexReachable = true
      monitor._updateBitfinexStatus(true)
      expect(spy).not.toHaveBeenCalled()

      window.removeEventListener("exchange:change", spy)
    })
  })

  describe("start/stop", () => {
    it("only starts once", () => {
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))
      monitor.start()
      const interval1 = monitor._interval
      monitor.start()
      expect(monitor._interval).toBe(interval1)
    })

    it("clears interval on stop", () => {
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))
      monitor.start()
      expect(monitor._interval).not.toBeNull()
      monitor.stop()
      expect(monitor._interval).toBeNull()
      expect(monitor._started).toBe(false)
    })

    it("unsubscribes from ActionCable on stop", () => {
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 200 }))
      monitor.start()
      const unsubscribeSpy = monitor._subscription?.unsubscribe
      monitor.stop()
      expect(monitor._subscription).toBeNull()
      if (unsubscribeSpy) expect(unsubscribeSpy).toHaveBeenCalled()
    })
  })
})
