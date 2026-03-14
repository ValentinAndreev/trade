import { describe, it, expect, vi } from "vitest"
import ScaleManager from "../../chart/scale_manager"
import type { RuntimeOverlay } from "../../types/store"

function makeOverlay(partial: Partial<RuntimeOverlay>): RuntimeOverlay {
  return {
    mode: "price",
    chartType: "Candlestick",
    visible: true,
    colorIndex: 0,
    colorScheme: 0,
    opacity: 1,
    colors: { up: "#26a69a", down: "#ef5350", line: "#2196f3" },
    basePriceScaleId: "overlay-base",
    activePriceScaleId: "overlay-base",
    symbol: "BTCUSD",
    indicatorType: null,
    indicatorParams: null,
    indicatorSource: "client",
    pinnedTo: null,
    series: null,
    indicatorSeries: [],
    ...partial,
  }
}

describe("ScaleManager", () => {
  it("keeps overlay indicators like SMA on the same scale as their pinned price overlay", () => {
    const priceSeries = { applyOptions: vi.fn() } as never
    const smaSeries = { applyOptions: vi.fn() } as never
    const rightScale = { applyOptions: vi.fn() }
    const hiddenScale = { applyOptions: vi.fn() }

    const overlayMap = new Map<string, RuntimeOverlay>([
      ["price-1", makeOverlay({
        mode: "price",
        basePriceScaleId: "overlay-price-1",
        activePriceScaleId: "overlay-price-1",
        series: priceSeries,
      })],
      ["sma-1", makeOverlay({
        mode: "indicator",
        indicatorType: "sma",
        pinnedTo: "price-1",
        basePriceScaleId: "overlay-sma-1",
        activePriceScaleId: "overlay-sma-1",
        indicatorSeries: [{ series: smaSeries, fieldKey: "sma" }],
        series: null,
      })],
    ])

    const chart = {
      applyOptions: vi.fn(),
      priceScale: vi.fn((id: string) => (id === "right" ? rightScale : hiddenScale)),
    } as never

    new ScaleManager(chart, overlayMap).syncSelectedOverlayScale("sma-1")

    expect(priceSeries.applyOptions).toHaveBeenCalledWith({ priceScaleId: "right" })
    expect(smaSeries.applyOptions).toHaveBeenCalledWith({ priceScaleId: "right" })
    expect(overlayMap.get("price-1")?.activePriceScaleId).toBe("right")
    expect(overlayMap.get("sma-1")?.activePriceScaleId).toBe("right")
  })
})
