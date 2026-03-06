import { describe, it, expect, vi } from "vitest"

vi.mock("../../config/constants", () => ({
  SPARKLINE_UP_COLOR: "#4ade80",
  SPARKLINE_DOWN_COLOR: "#f87171",
  SPARKLINE_WIDTH: 80,
  SPARKLINE_HEIGHT: 48,
  SPARKLINE_PADDING: 4,
}))

import { tickerTileHTML, marketTileHTML, sparklineSVG } from "../../templates/main_templates"

describe("tickerTileHTML", () => {
  const baseTicker = {
    symbol: "BTCUSD",
    last_price: 50000,
    change_24h: 1500,
    change_24h_perc: 0.03,
    volume: 123456,
    high: 51000,
    low: 49000,
  }

  it("renders the symbol", () => {
    expect(tickerTileHTML(baseTicker)).toContain("BTCUSD")
  })

  it("renders formatted price with $ prefix", () => {
    const html = tickerTileHTML(baseTicker)
    expect(html).toContain("$")
    expect(html).toContain("50")
  })

  it("shows green color for positive change", () => {
    const html = tickerTileHTML(baseTicker)
    expect(html).toContain("text-green-400")
    expect(html).toContain("+3.00%")
  })

  it("shows red color for negative change", () => {
    const html = tickerTileHTML({ ...baseTicker, change_24h: -1500, change_24h_perc: -0.03 })
    expect(html).toContain("text-red-400")
    expect(html).toContain("-3.00%")
  })

  it("renders volume, high, and low", () => {
    const html = tickerTileHTML(baseTicker)
    expect(html).toContain("Vol:")
    expect(html).toContain("H:")
    expect(html).toContain("L:")
  })

  it("includes sparkline SVG when data available", () => {
    const html = tickerTileHTML({ ...baseTicker, sparkline: [100, 200, 150] })
    expect(html).toContain("<svg")
    expect(html).toContain("polyline")
  })

  it("renders updated_at when present", () => {
    const html = tickerTileHTML({ ...baseTicker, updated_at: "2026-03-06T14:30:00Z" })
    expect(html).toMatch(/\d{2}\.\d{2} \d{2}:\d{2}/)
  })
})

describe("marketTileHTML", () => {
  const baseQuote = {
    symbol: "^GSPC",
    name: "S&P 500",
    price: 5200.55,
    change: 45.2,
    change_pct: 0.87,
  }

  it("returns empty string for null", () => {
    expect(marketTileHTML(null, "indices")).toBe("")
  })

  it("renders name and price for indices", () => {
    const html = marketTileHTML(baseQuote, "indices")
    expect(html).toContain("S&P 500")
    expect(html).toContain("$")
    expect(html).toContain("5,200.55")
  })

  it("uses 4 decimal places for forex", () => {
    const forex = { symbol: "EURUSD", name: "EUR/USD", price: 1.0856, change: 0.0012, change_pct: 0.11 }
    const html = marketTileHTML(forex, "forex")
    expect(html).toContain("1.0856")
    expect(html).not.toContain("$")
  })

  it("uses 2 decimal places for commodities", () => {
    const commodity = { symbol: "GC=F", name: "Gold", price: 2050.75, change: 15.3, change_pct: 0.75 }
    const html = marketTileHTML(commodity, "commodities")
    expect(html).toContain("$")
    expect(html).toContain("2,050.75")
  })

  it("shows green class for positive change", () => {
    expect(marketTileHTML(baseQuote, "indices")).toContain("text-green-400")
  })

  it("shows red class for negative change", () => {
    const negative = { ...baseQuote, change: -30, change_pct: -0.58 }
    expect(marketTileHTML(negative, "indices")).toContain("text-red-400")
  })

  it("renders high and low when present", () => {
    const withHiLo = { ...baseQuote, high: 5250, low: 5150 }
    const html = marketTileHTML(withHiLo, "indices")
    expect(html).toContain("H:")
    expect(html).toContain("L:")
  })

  it("renders updated_at when present", () => {
    const withDate = { ...baseQuote, updated_at: "2026-03-06T10:00:00Z" }
    const html = marketTileHTML(withDate, "indices")
    expect(html).toMatch(/\d{2}\.\d{2} \d{2}:\d{2}/)
  })
})

describe("sparklineSVG", () => {
  it("generates valid SVG element", () => {
    const svg = sparklineSVG([10, 20, 15, 25], true)
    expect(svg).toContain("<svg")
    expect(svg).toContain("</svg>")
    expect(svg).toContain("<polyline")
    expect(svg).toContain('viewBox="0 0 80 48"')
  })

  it("uses up color for positive trend", () => {
    const svg = sparklineSVG([10, 20], true)
    expect(svg).toContain("#4ade80")
  })

  it("uses down color for negative trend", () => {
    const svg = sparklineSVG([20, 10], false)
    expect(svg).toContain("#f87171")
  })

  it("handles flat data (all same values)", () => {
    const svg = sparklineSVG([50, 50, 50], true)
    expect(svg).toContain("<polyline")
  })

  it("generates correct number of coordinate pairs", () => {
    const svg = sparklineSVG([1, 2, 3, 4, 5], true)
    const points = svg.match(/points="([^"]+)"/)?.[1] || ""
    const coords = points.trim().split(" ")
    expect(coords).toHaveLength(5)
  })
})
