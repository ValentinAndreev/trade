import { beforeEach, describe, expect, it, vi } from "vitest"
import { OptimizationChart } from "../../research/optimization_chart"

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("OptimizationChart", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  })

  it("builds without crashing for multiple points", () => {
    const el = document.createElement("div")
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 640 })
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 260 })

    const chart = new OptimizationChart(
      el,
      [
        { index: 0, x: 5, y: 1.1 },
        { index: 1, x: 6, y: 1.4 },
      ],
      0,
      "Module period",
      "Sharpe",
      () => {},
    )

    expect(() => chart.build()).not.toThrow()
    expect(el.querySelector("svg")).not.toBeNull()
  })

  it("selects the nearest point on click", () => {
    const el = document.createElement("div")
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 640 })
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 260 })

    const onSelect = vi.fn()
    const chart = new OptimizationChart(
      el,
      [
        { index: 0, x: 5, y: 1.1 },
        { index: 1, x: 10, y: 1.4 },
      ],
      0,
      "Module period",
      "Sharpe",
      onSelect,
    )

    chart.build()

    const svg = el.querySelector("[data-optimization-svg]") as SVGSVGElement | null
    expect(svg).not.toBeNull()
    svg!.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 260,
      right: 640,
      width: 640,
      height: 260,
      toJSON: () => ({}),
    })

    svg!.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      clientX: 560,
      clientY: 120,
    }))

    svg!.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: 560,
      clientY: 120,
    }))

    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
