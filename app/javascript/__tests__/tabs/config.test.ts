import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../services/api_fetch", () => ({
  apiFetch: vi.fn(),
}))

import { fetchConfig } from "../../tabs/config"
import { apiFetch } from "../../services/api_fetch"

describe("fetchConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns merged configs and indicators on success", async () => {
    const configResp = new Response(JSON.stringify({ symbols: ["BTCUSD"], timeframes: ["1m", "5m"] }))
    const indicatorsResp = new Response(JSON.stringify([{ key: "sma", label: "SMA" }]))
    Object.defineProperty(indicatorsResp, "ok", { value: true })

    vi.mocked(apiFetch).mockImplementation((url: string | URL) => {
      if (String(url) === "/api/configs") return Promise.resolve(configResp)
      if (String(url) === "/api/indicators") return Promise.resolve(indicatorsResp)
      return Promise.resolve(null)
    })

    const result = await fetchConfig()
    expect(result.symbols).toEqual(["BTCUSD"])
    expect(result.timeframes).toEqual(["1m", "5m"])
    expect(result.indicators).toEqual([{ key: "sma", label: "SMA" }])
  })

  it("returns empty arrays when config fetch fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue(null)
    const result = await fetchConfig()
    expect(result).toEqual({ symbols: [], timeframes: [], indicators: [] })
  })

  it("returns empty indicators when indicators fetch fails", async () => {
    const configResp = new Response(JSON.stringify({ symbols: ["ETHUSD"], timeframes: ["1h"] }))
    vi.mocked(apiFetch).mockImplementation((url: string | URL) => {
      if (String(url) === "/api/configs") return Promise.resolve(configResp)
      return Promise.resolve(null)
    })

    const result = await fetchConfig()
    expect(result.symbols).toEqual(["ETHUSD"])
    expect(result.indicators).toEqual([])
  })

  it("returns empty on exception", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("crash"))
    const result = await fetchConfig()
    expect(result).toEqual({ symbols: [], timeframes: [], indicators: [] })
  })
})
