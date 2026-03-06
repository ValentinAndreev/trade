import { describe, it, expect } from "vitest"
import { findFirstPriceSeries } from "../../chart/overlay_utils"

describe("findFirstPriceSeries", () => {
  it("returns first visible non-indicator overlay series", () => {
    const mockSeries = { type: "Candlestick" }
    const map = new Map([
      ["o-1", { mode: "price", series: mockSeries, visible: true }],
      ["o-2", { mode: "indicator", series: { type: "Line" }, visible: true }],
    ])
    expect(findFirstPriceSeries(map)).toBe(mockSeries)
  })

  it("skips invisible overlays", () => {
    const map = new Map([
      ["o-1", { mode: "price", series: { type: "Candlestick" }, visible: false }],
      ["o-2", { mode: "volume", series: { type: "Histogram" }, visible: true }],
    ])
    expect(findFirstPriceSeries(map)).toEqual({ type: "Histogram" })
  })

  it("returns null when no matching overlay exists", () => {
    const map = new Map([
      ["o-1", { mode: "indicator", series: { type: "Line" }, visible: true }],
    ])
    expect(findFirstPriceSeries(map)).toBeNull()
  })

  it("returns null for empty map", () => {
    expect(findFirstPriceSeries(new Map())).toBeNull()
  })

  it("skips overlays without series", () => {
    const map = new Map([
      ["o-1", { mode: "price", series: null, visible: true }],
    ])
    expect(findFirstPriceSeries(map)).toBeNull()
  })
})
