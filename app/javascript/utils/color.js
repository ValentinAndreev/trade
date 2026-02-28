// Shared color utilities

import { OVERLAY_COLORS } from "../chart/theme"

export function withAlpha(color, alpha = 1) {
  const a = Math.max(0, Math.min(1, alpha))

  if (typeof color === "string" && color.startsWith("#")) {
    let hex = color.slice(1)
    if (hex.length === 3) {
      hex = hex.split("").map(ch => ch + ch).join("")
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r},${g},${b},${a})`
    }
  }

  const rgbaMatch = typeof color === "string" && color.match(/^rgba?\(([^)]+)\)$/)
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map(part => part.trim())
    if (parts.length >= 3) {
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`
    }
  }

  return color
}

export function normalizeColorScheme(colorScheme, fallback = 0) {
  const value = parseInt(colorScheme, 10)
  if (Number.isNaN(value) || value < 0) return ((fallback % OVERLAY_COLORS.length) + OVERLAY_COLORS.length) % OVERLAY_COLORS.length
  return value % OVERLAY_COLORS.length
}

export function normalizeOpacity(opacity, fallback = 1) {
  const value = parseFloat(opacity)
  if (Number.isNaN(value)) return fallback
  if (value < 0) return 0
  if (value > 1) return 1
  return Math.round(value * 100) / 100
}
