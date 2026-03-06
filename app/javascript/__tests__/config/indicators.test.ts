import { describe, it, expect } from "vitest"
import { INDICATOR_META } from "../../config/indicators"
import type { CandleWithValue } from "../../types/candle"

function mockCandles(n: number): CandleWithValue[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1000 + i,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
    volume: 1000 + i * 10,
    value: 102 + i,
  }))
}

describe("INDICATOR_META", () => {
  it("has expected indicator keys", () => {
    expect(INDICATOR_META).toHaveProperty("sma")
    expect(INDICATOR_META).toHaveProperty("ema")
    expect(INDICATOR_META).toHaveProperty("rsi")
    expect(INDICATOR_META).toHaveProperty("macd")
    expect(INDICATOR_META).toHaveProperty("bb")
    expect(INDICATOR_META).toHaveProperty("adx")
    expect(INDICATOR_META).toHaveProperty("obv")
  })

  describe("SMA", () => {
    const meta = INDICATOR_META.sma

    it("has correct structure", () => {
      expect(meta.label).toBe("SMA")
      expect(meta.requires).toBe("values")
      expect(meta.overlay).toBe(true)
      expect(meta.fields).toHaveLength(1)
      expect(meta.defaults).toEqual({ period: 20 })
    })

    it("lib.input produces correct shape", () => {
      const data = mockCandles(30)
      const input = meta.lib!.input(data, { period: 5 })
      expect(input).toHaveProperty("period", 5)
      expect(input).toHaveProperty("values")
      expect((input as any).values).toHaveLength(30)
    })

    it("lib.fn computes SMA values", () => {
      const data = mockCandles(30)
      const input = meta.lib!.input(data, { period: 5 }) as any
      const result = meta.lib!.fn(input)
      expect(result.length).toBeGreaterThan(0)
      expect(typeof result[0]).toBe("number")
    })

    it("lib.map wraps result", () => {
      expect(meta.lib!.map(42.5)).toEqual({ sma: 42.5 })
    })
  })

  describe("EMA", () => {
    it("computes EMA values", () => {
      const meta = INDICATOR_META.ema
      const data = mockCandles(30)
      const input = meta.lib!.input(data, { period: 10 }) as any
      const result = meta.lib!.fn(input)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe("RSI", () => {
    const meta = INDICATOR_META.rsi

    it("has correct structure", () => {
      expect(meta.requires).toBe("values")
      expect(meta.overlay).toBeUndefined()
      expect(meta.defaults).toEqual({ period: 14 })
    })

    it("computes RSI values", () => {
      const data = mockCandles(30)
      const input = meta.lib!.input(data, { period: 14 }) as any
      const result = meta.lib!.fn(input)
      expect(result.length).toBeGreaterThan(0)
      result.forEach((v: number) => {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      })
    })
  })

  describe("MACD", () => {
    const meta = INDICATOR_META.macd

    it("has 3 fields", () => {
      expect(meta.fields).toHaveLength(3)
      expect(meta.fields.map(f => f.key)).toEqual(["macd_line", "signal_line", "macd_histogram"])
    })

    it("lib.map extracts MACD fields", () => {
      const mapped = meta.lib!.map({ MACD: 1.5, signal: 0.8, histogram: 0.7 })
      expect(mapped).toEqual({ macd_line: 1.5, signal_line: 0.8, macd_histogram: 0.7 })
    })

    it("lib.map handles nulls", () => {
      const mapped = meta.lib!.map({})
      expect(mapped).toEqual({ macd_line: null, signal_line: null, macd_histogram: null })
    })
  })

  describe("BollingerBands", () => {
    const meta = INDICATOR_META.bb

    it("lib.input includes stdDev", () => {
      const data = mockCandles(30)
      const input = meta.lib!.input(data, { period: 20, standard_deviations: 2 }) as any
      expect(input.stdDev).toBe(2)
      expect(input.period).toBe(20)
    })

    it("lib.map extracts bands", () => {
      const mapped = meta.lib!.map({ upper: 110, middle: 100, lower: 90 })
      expect(mapped).toEqual({ upper_band: 110, middle_band: 100, lower_band: 90 })
    })
  })

  describe("ADX (OHLC indicator)", () => {
    const meta = INDICATOR_META.adx

    it("requires ohlc", () => {
      expect(meta.requires).toBe("ohlc")
    })

    it("lib.input includes high/low/close", () => {
      const data = mockCandles(30)
      const input = meta.lib!.input(data, { period: 14 }) as any
      expect(input.high).toHaveLength(30)
      expect(input.low).toHaveLength(30)
      expect(input.close).toHaveLength(30)
    })
  })

  describe("OBV (OHLCV indicator)", () => {
    const meta = INDICATOR_META.obv

    it("requires ohlcv", () => {
      expect(meta.requires).toBe("ohlcv")
    })

    it("computes OBV values", () => {
      const data = mockCandles(30)
      const input = meta.lib!.input(data, {}) as any
      const result = meta.lib!.fn(input)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe("server-only indicators", () => {
    it("sr has no lib", () => {
      expect(INDICATOR_META.sr.lib).toBeUndefined()
    })
  })
})
