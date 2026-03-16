import { BG_HOVER, BG_PRIMARY, BORDER_COLOR, ACCENT_COLOR } from "../config/theme"

export interface OptimizationPoint {
  index: number
  x: number
  y: number
}

export class OptimizationChart {
  private resizeObserver: ResizeObserver | null = null
  private interactionCleanup: (() => void) | null = null

  constructor(
    private el: HTMLElement,
    private points: OptimizationPoint[],
    private selectedIndex: number,
    private xLabel: string,
    private yLabel: string,
    private onSelect: (index: number) => void,
  ) {}

  build(): void {
    this.destroy()

    if (!this.points.length) {
      this.el.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-gray-500">No optimization data.</div>`
      return
    }

    const width = Math.max(this.el.clientWidth, 320)
    const height = Math.max(this.el.clientHeight, 220)
    const padding = { top: 20, right: 20, bottom: 40, left: 56 }

    const xs = this.points.map(point => point.x)
    const ys = this.points.map(point => Number.isFinite(point.y) ? point.y : 0)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMinBase = Math.min(...ys)
    const yMaxBase = Math.max(...ys)
    const xRange = xMax - xMin || 1
    const yRange = yMaxBase - yMinBase || 1
    const yMin = yMinBase - yRange * 0.05
    const yMax = yMaxBase + yRange * 0.05

    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const scaleX = (value: number) => padding.left + ((value - xMin) / xRange) * plotWidth
    const scaleY = (value: number) => padding.top + (1 - ((value - yMin) / (yMax - yMin || 1))) * plotHeight

    const sorted = [...this.points].sort((a, b) => a.x - b.x)
    const polyline = sorted
      .map(point => `${scaleX(point.x)},${scaleY(Number.isFinite(point.y) ? point.y : 0)}`)
      .join(" ")

    const yTicks = Array.from({ length: 5 }, (_unused, idx) => {
      const value = yMin + ((yMax - yMin) * idx) / 4
      return { value, y: scaleY(value) }
    })

    const xTickCount = Math.min(5, sorted.length)
    const xTicks = Array.from({ length: xTickCount }, (_unused, idx) => {
      const ratio = xTickCount === 1 ? 0 : idx / (xTickCount - 1)
      const value = xMin + ratio * xRange
      return { value, x: scaleX(value) }
    })

    const selectionBands = sorted.map((point, idx) => {
      const currentX = scaleX(point.x)
      const prevX = idx > 0 ? scaleX(sorted[idx - 1].x) : padding.left
      const nextX = idx < sorted.length - 1 ? scaleX(sorted[idx + 1].x) : (width - padding.right)
      const left = idx === 0 ? padding.left : (prevX + currentX) / 2
      const right = idx === sorted.length - 1 ? (width - padding.right) : (currentX + nextX) / 2
      const selected = point.index === this.selectedIndex

      return `
        <rect
          x="${left}"
          y="${padding.top}"
          width="${Math.max(8, right - left)}"
          height="${plotHeight}"
          fill="${selected ? "rgba(59,130,246,0.08)" : "rgba(0,0,0,0)"}"
          pointer-events="none"
        ></rect>
      `
    }).join("")

    const circles = sorted.map(point => {
      const cx = scaleX(point.x)
      const cy = scaleY(Number.isFinite(point.y) ? point.y : 0)
      const selected = point.index === this.selectedIndex
      const radius = selected ? 5 : 4
      const fill = selected ? ACCENT_COLOR : "#9ca3af"
      const stroke = selected ? "#ffffff" : "#1f2937"

      return `
        <circle
          cx="${cx}"
          cy="${cy}"
          r="${radius}"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="${selected ? 2 : 1}"
          data-point-index="${point.index}"
          class="cursor-pointer"
        >
          <title>${this.xLabel}: ${point.x}, ${this.yLabel}: ${formatTick(Number.isFinite(point.y) ? point.y : 0)}</title>
        </circle>
      `
    }).join("")

    this.el.innerHTML = `
      <svg data-optimization-svg viewBox="0 0 ${width} ${height}" class="w-full h-full block rounded border border-[${BORDER_COLOR}] bg-[${BG_PRIMARY}] cursor-pointer">
        <rect x="0" y="0" width="${width}" height="${height}" fill="${BG_PRIMARY}" />
        ${yTicks.map(tick => `
          <line x1="${padding.left}" y1="${tick.y}" x2="${width - padding.right}" y2="${tick.y}" stroke="${BG_HOVER}" stroke-width="1" />
          <text x="${padding.left - 8}" y="${tick.y + 4}" text-anchor="end" fill="#9ca3af" font-size="11">${formatTick(tick.value)}</text>
        `).join("")}
        ${xTicks.map(tick => `
          <line x1="${tick.x}" y1="${padding.top}" x2="${tick.x}" y2="${height - padding.bottom}" stroke="${BG_HOVER}" stroke-width="1" />
          <text x="${tick.x}" y="${height - 12}" text-anchor="middle" fill="#9ca3af" font-size="11">${formatTick(tick.value)}</text>
        `).join("")}
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1" />
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#6b7280" stroke-width="1" />
        ${selectionBands}
        <polyline fill="none" stroke="${ACCENT_COLOR}" stroke-width="2" points="${polyline}" />
        ${circles}
        <text x="${width / 2}" y="${height - 4}" text-anchor="middle" fill="#9ca3af" font-size="12">${this.xLabel}</text>
        <text x="14" y="${height / 2}" text-anchor="middle" fill="#9ca3af" font-size="12" transform="rotate(-90 14 ${height / 2})">${this.yLabel}</text>
      </svg>
    `

    const svgEl = this.el.querySelector("[data-optimization-svg]") as SVGSVGElement | null
    const handleInteraction = (event: MouseEvent | PointerEvent) => {
      const rect = (svgEl || this.el).getBoundingClientRect()
      if (!rect.width) return

      const relativeX = ((event.clientX - rect.left) / rect.width) * width
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, relativeX))

      const nearest = sorted.reduce<OptimizationPoint | null>((best, point) => {
        if (!best) return point
        const bestDistance = Math.abs(scaleX(best.x) - clampedX)
        const currentDistance = Math.abs(scaleX(point.x) - clampedX)
        return currentDistance < bestDistance ? point : best
      }, null)

      if (!nearest) return
      this.onSelect(nearest.index)
    }

    if (svgEl) {
      const pointerup = (event: PointerEvent) => handleInteraction(event)
      const click = (event: MouseEvent) => handleInteraction(event)
      svgEl.addEventListener("pointerup", pointerup, true)
      svgEl.addEventListener("click", click, true)
      this.interactionCleanup = () => {
        svgEl.removeEventListener("pointerup", pointerup, true)
        svgEl.removeEventListener("click", click, true)
      }
    }

    this.resizeObserver = new ResizeObserver(() => this.build())
    this.resizeObserver.observe(this.el)
  }

  setSelectedIndex(index: number): void {
    if (this.selectedIndex === index) return
    this.selectedIndex = index
    this.build()
  }

  destroy(): void {
    this.interactionCleanup?.()
    this.interactionCleanup = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }
}

function formatTick(value: number): string {
  if (!Number.isFinite(value)) return "0"
  if (Math.abs(value) >= 1000) return value.toFixed(0)
  if (Math.abs(value) >= 100) return value.toFixed(1)
  return value.toFixed(2)
}
