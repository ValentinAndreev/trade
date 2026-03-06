import { describe, it, expect, vi } from "vitest"

vi.mock("../../config/theme", () => ({
  OVERLAY_COLORS: Array.from({ length: 10 }, (_, i) => ({
    up: `#up${i}`, down: `#down${i}`, line: `#line${i}`,
  })),
}))

import { withAlpha, normalizeColorScheme, normalizeOpacity } from "../../utils/color"

describe("withAlpha", () => {
  it("converts 6-digit hex to rgba", () => {
    expect(withAlpha("#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)")
  })

  it("converts 3-digit hex to rgba", () => {
    expect(withAlpha("#f00", 0.8)).toBe("rgba(255,0,0,0.8)")
  })

  it("replaces alpha in existing rgba", () => {
    expect(withAlpha("rgba(100,200,50,1)", 0.3)).toBe("rgba(100,200,50,0.3)")
  })

  it("replaces alpha in rgb (no alpha)", () => {
    expect(withAlpha("rgb(100,200,50)", 0.7)).toBe("rgba(100,200,50,0.7)")
  })

  it("clamps alpha to 0-1", () => {
    expect(withAlpha("#ff0000", -0.5)).toBe("rgba(255,0,0,0)")
    expect(withAlpha("#ff0000", 2)).toBe("rgba(255,0,0,1)")
  })

  it("defaults alpha to 1 when undefined", () => {
    expect(withAlpha("#ff0000")).toBe("rgba(255,0,0,1)")
  })

  it("passes through invalid color strings", () => {
    expect(withAlpha("not-a-color", 0.5)).toBe("not-a-color")
  })
})

describe("normalizeColorScheme", () => {
  it("wraps with modulo for valid values", () => {
    expect(normalizeColorScheme(0)).toBe(0)
    expect(normalizeColorScheme(5)).toBe(5)
    expect(normalizeColorScheme(12)).toBe(2)
  })

  it("uses fallback for NaN", () => {
    expect(normalizeColorScheme(NaN, 3)).toBe(3)
  })

  it("uses fallback for negative values", () => {
    expect(normalizeColorScheme(-1, 2)).toBe(2)
  })

  it("defaults fallback to 0", () => {
    expect(normalizeColorScheme(NaN)).toBe(0)
  })
})

describe("normalizeOpacity", () => {
  it("clamps to 0-1 range", () => {
    expect(normalizeOpacity(0.5)).toBe(0.5)
    expect(normalizeOpacity(-1)).toBe(0)
    expect(normalizeOpacity(2)).toBe(1)
  })

  it("rounds to 2 decimal places", () => {
    expect(normalizeOpacity(0.333)).toBe(0.33)
    expect(normalizeOpacity(0.999)).toBe(1)
  })

  it("uses fallback for NaN", () => {
    expect(normalizeOpacity(NaN, 0.8)).toBe(0.8)
    expect(normalizeOpacity(NaN)).toBe(1)
  })

  it("parses string values", () => {
    expect(normalizeOpacity("0.75" as any)).toBe(0.75)
  })
})
