import { PANEL_MIN_HEIGHT_PX } from "../config/constants"

export function startPanelResize(e: MouseEvent, controllerName: string): void {
  e.preventDefault()
  const divider = e.currentTarget as HTMLElement
  const wrapper = divider.closest("[data-tab-wrapper]") as HTMLElement | null
  if (!wrapper) return
  const aboveEl = wrapper.querySelector<HTMLElement>(`[data-panel-id="${divider.dataset.above}"]`)
  const belowEl = wrapper.querySelector<HTMLElement>(`[data-panel-id="${divider.dataset.below}"]`)
  if (!aboveEl || !belowEl) return

  const allPanels = [...wrapper.querySelectorAll<HTMLElement>(":scope > [data-panel-id]")]
  const heights = allPanels.map(p => p.offsetHeight)
  allPanels.forEach((p, i) => { p.style.flex = `0 0 ${heights[i]}px` })

  const startY = e.clientY
  const aboveH = aboveEl.offsetHeight
  const belowH = belowEl.offsetHeight
  const totalH = aboveH + belowH
  const minH = PANEL_MIN_HEIGHT_PX

  divider.classList.add("bg-[#5a5a7e]")

  const onMove = (ev: MouseEvent) => {
    const delta = ev.clientY - startY
    let newAbove = aboveH + delta
    let newBelow = belowH - delta
    if (newAbove < minH) { newAbove = minH; newBelow = totalH - minH }
    if (newBelow < minH) { newBelow = minH; newAbove = totalH - minH }
    aboveEl.style.flex = `0 0 ${newAbove}px`
    belowEl.style.flex = `0 0 ${newBelow}px`
  }

  const onUp = () => {
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup", onUp)
    divider.classList.remove("bg-[#5a5a7e]")
    const finalHeights = allPanels.map(p => p.offsetHeight)
    const totalFinal = finalHeights.reduce((a, b) => a + b, 0)
    allPanels.forEach((p, i) => { p.style.flex = `${finalHeights[i] / totalFinal}` })
  }

  document.addEventListener("mousemove", onMove)
  document.addEventListener("mouseup", onUp)
}
