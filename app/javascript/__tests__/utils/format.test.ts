import { describe, it, expect } from "vitest"
import {
  formatPrice,
  formatDateTime,
  formatDateShort,
  formatLocalePrice,
  formatLocaleNumber,
  formatTime,
  formatDateTimeShort,
  timeframeSeconds,
} from "../../utils/format"

describe("formatPrice", () => {
  it("returns 0 decimals for >= 1000", () => {
    expect(formatPrice(50000)).toBe("50000")
    expect(formatPrice(1000)).toBe("1000")
  })

  it("returns 2 decimals for >= 1", () => {
    expect(formatPrice(42.567)).toBe("42.57")
    expect(formatPrice(1)).toBe("1.00")
  })

  it("returns 4 significant digits for < 1", () => {
    expect(formatPrice(0.005432)).toBe("0.005432")
    expect(formatPrice(0.1234)).toBe("0.1234")
  })

  it("handles 0", () => {
    expect(formatPrice(0)).toBe("0.000")
  })

  it("handles negative values via toPrecision", () => {
    expect(formatPrice(-500)).toBe("-500.0")
    expect(formatPrice(-0.0053)).toBe("-0.005300")
  })
})

describe("formatDateTime", () => {
  it("returns empty string for null", () => {
    expect(formatDateTime(null)).toBe("")
  })

  it("returns empty string for 0", () => {
    expect(formatDateTime(0)).toBe("")
  })

  it("formats unix timestamp to date string", () => {
    const ts = new Date("2026-03-06T14:30:00Z").getTime() / 1000
    const result = formatDateTime(ts)
    expect(result).toMatch(/2026-03-06/)
    expect(result).toMatch(/\d{2}:\d{2}$/)
  })
})

describe("formatDateShort", () => {
  it("formats as dd.mm.yy", () => {
    const ts = new Date("2026-01-15T00:00:00").getTime() / 1000
    const result = formatDateShort(ts)
    expect(result).toBe("15.01.26")
  })
})

describe("formatLocalePrice", () => {
  it("returns dash for null/undefined", () => {
    expect(formatLocalePrice(null)).toBe("—")
    expect(formatLocalePrice(undefined)).toBe("—")
  })

  it("formats number with 2 decimals by default", () => {
    const result = formatLocalePrice(1234.5)
    expect(result).toMatch(/1.*234\.50/)
  })

  it("respects custom decimals", () => {
    const result = formatLocalePrice(1.23456, 4)
    expect(result).toMatch(/1\.2346/)
  })
})

describe("formatLocaleNumber", () => {
  it("returns dash for null", () => {
    expect(formatLocaleNumber(null)).toBe("—")
  })

  it("formats numbers with up to 2 decimals", () => {
    const result = formatLocaleNumber(1234567.89)
    expect(result).toMatch(/1.*234.*567\.89/)
  })
})

describe("formatTime", () => {
  it("extracts hh:mm from ISO string", () => {
    const result = formatTime("2026-03-06T14:05:00Z")
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe("formatDateTimeShort", () => {
  it("returns dd.mm hh:mm format", () => {
    const result = formatDateTimeShort("2026-03-06T14:05:00Z")
    expect(result).toMatch(/\d{2}\.\d{2} \d{2}:\d{2}/)
  })
})

describe("timeframeSeconds", () => {
  it("parses minutes", () => {
    expect(timeframeSeconds("1m")).toBe(60)
    expect(timeframeSeconds("5m")).toBe(300)
    expect(timeframeSeconds("45m")).toBe(2700)
  })

  it("parses hours", () => {
    expect(timeframeSeconds("1h")).toBe(3600)
    expect(timeframeSeconds("2h")).toBe(7200)
  })

  it("parses days", () => {
    expect(timeframeSeconds("1d")).toBe(86400)
    expect(timeframeSeconds("3d")).toBe(259200)
  })

  it("parses weeks", () => {
    expect(timeframeSeconds("1w")).toBe(604800)
  })

  it("parses months", () => {
    expect(timeframeSeconds("1M")).toBe(2592000)
  })

  it("parses seconds", () => {
    expect(timeframeSeconds("30s")).toBe(30)
  })

  it("falls back to 60 for unrecognised format", () => {
    expect(timeframeSeconds("invalid")).toBe(60)
    expect(timeframeSeconds("")).toBe(60)
    expect(timeframeSeconds("1x")).toBe(60)
  })
})
