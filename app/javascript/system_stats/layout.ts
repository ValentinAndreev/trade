import { ACCENT_COLOR, BG_PRIMARY, BG_HOVER, BORDER_COLOR } from "../config/theme"

export function layoutHTML(equityColor: string, equityType: string): string {
  const typeBtns = (["line", "area", "histogram", "baseline"] as const).map(t => {
    const labels: Record<string, string> = { line: "Line", area: "Area", histogram: "Bars", baseline: "±Zero" }
    return `<button data-chart-type="${t}"
                    class="px-2 py-0.5 text-xs rounded cursor-pointer hover:bg-[${BORDER_COLOR}] transition-colors">${labels[t]}</button>`
  }).join("")

  return `
    <div class="flex flex-col h-full w-full overflow-hidden text-white">
      <div data-equity-toolbar class="flex-none flex items-center gap-2 px-3 py-1.5 bg-[${BG_PRIMARY}] border-b border-[${BG_HOVER}]">
        <span class="text-xs text-gray-500 uppercase tracking-wide">Equity</span>
        <div class="flex gap-1">${typeBtns}</div>
        <input type="color" data-field="equityColor" value="${equityColor}"
               class="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 ml-1 shrink-0"
               title="Chart color">
      </div>
      <div data-chart-area class="flex-none w-full" style="height:500px; min-height:80px"></div>
      <div data-resize-handle
           class="flex-none h-1.5 w-full bg-[${BG_HOVER}] hover:bg-blue-500 cursor-row-resize transition-colors shrink-0"></div>
      <div class="flex flex-row flex-1 min-h-0 overflow-hidden w-full">
        <div class="flex-none w-[27rem] overflow-y-auto p-4 border-r border-[${BG_HOVER}]" data-metrics></div>
        <div class="flex-1 min-w-0" data-trades></div>
      </div>
    </div>`
}

export function skeletonHTML(): string {
  return `<div class="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">Loading statistics…</div>`
}

export function setupResizeHandle(
  container: Element,
  chart: import("lightweight-charts").IChartApi | null,
  onChartResize: () => void,
): () => void {
  const handle    = container.querySelector("[data-resize-handle]") as HTMLElement | null
  const chartArea = container.querySelector("[data-chart-area]")    as HTMLElement | null
  if (!handle || !chartArea) return () => {}

  let startY = 0, startH = 0

  const onMove = (e: MouseEvent) => {
    const newH = Math.max(80, Math.min(startH + (e.clientY - startY), window.innerHeight * 0.75))
    chartArea.style.height = `${newH}px`
    onChartResize()
  }
  const onUp = () => {
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup", onUp)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
  }
  const onDown = (e: MouseEvent) => {
    startY = e.clientY
    startH = chartArea.offsetHeight
    document.body.style.userSelect = "none"
    document.body.style.cursor = "row-resize"
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }
  handle.addEventListener("mousedown", onDown)
  return () => { handle.removeEventListener("mousedown", onDown); onUp() }
}

// Re-export for convenience
export { ACCENT_COLOR as DEFAULT_EQUITY_COLOR }
