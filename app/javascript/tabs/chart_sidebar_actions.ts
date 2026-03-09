import TabStore from "./store"
import { INDICATOR_META } from "../config/indicators"
import connectionMonitor from "../services/connection_monitor"
import type TabRenderer from "./renderer"
import type { Panel } from "../types/store"

interface ChartSidebarDeps {
  store: TabStore
  renderer: TabRenderer
  sidebarTarget: HTMLElement
  chartCtrlFn: () => any
  renderFn: () => void
}

export default class ChartSidebarActions {
  private deps: ChartSidebarDeps

  constructor(deps: ChartSidebarDeps) {
    this.deps = deps
  }

  private get store() { return this.deps.store }
  private get sidebar() { return this.deps.sidebarTarget }
  private withChartCtrl(fn: (ctrl: any) => void) {
    const ctrl = this.deps.chartCtrlFn()
    if (ctrl) fn(ctrl)
  }
  private get render() { return this.deps.renderFn }

  applySettings() {
    const panel = this.store.selectedPanel
    const overlay = this.store.selectedOverlay
    if (!panel || !overlay) return

    const timeframeEl = this.sidebar.querySelector("[data-field='timeframe']:not(.hidden)") as HTMLSelectElement | null
    const timeframe = timeframeEl?.value?.trim().toLowerCase()
    if (!timeframe) return

    const timeframeChanged = this.store.updatePanelTimeframe(panel.id, timeframe)

    const changed = overlay.mode === "indicator"
      ? this._applyIndicatorSettings(panel, overlay, timeframeChanged)
      : this._applySymbolSettings(overlay, timeframeChanged)

    if (changed === null) return
    if (timeframeChanged || changed) this.render()
  }

  applySettingsOnEnter(e: KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.applySettings()
  }

  setMode(e: Event) {
    const mode = (e.currentTarget as HTMLElement).dataset.mode
    const overlay = this.store.selectedOverlay
    if (!overlay || !mode) return

    if (this.store.setOverlayMode(overlay.id, mode as "price" | "volume" | "indicator")) {
      this.withChartCtrl(c => {
        c.showMode(overlay.id, mode)
        if (mode === "indicator") {
          c.updateIndicator(overlay.id, overlay.indicatorType, overlay.indicatorParams, overlay.pinnedTo, overlay.indicatorSource)
        }
      })
      this.render()
    }
  }

  switchChartType(e: Event) {
    const type = (e.currentTarget as HTMLInputElement).value
    const overlay = this.store.selectedOverlay
    if (!overlay) return
    if (this.store.setOverlayChartType(overlay.id, type)) {
      this.withChartCtrl(c => c.switchChartType(overlay.id, type))
    }
  }

  changePinnedTo(e: Event) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return
    const pinnedTo = (e.currentTarget as HTMLInputElement).value || null
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)
    this.withChartCtrl(c => c.setPinnedTo(overlay.id, pinnedTo))
  }

  cycleIndicatorFilter(): void {
    const filters = ["all", "client", "server"]
    const current = (this.deps.renderer.sidebar as any).indicatorFilter || "all"
    const next = filters[(filters.indexOf(current) + 1) % filters.length]
    ;(this.deps.renderer.sidebar as any).indicatorFilter = next
    this.render()
  }

  switchIndicatorType(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value
    const overlay = this.store.selectedOverlay
    if (!overlay || !raw) return

    const [type, source] = raw.includes("|") ? raw.split("|") : [raw, null]
    const meta = INDICATOR_META[type]
    const params = meta ? { ...meta.defaults } : {}

    this.store.setOverlayIndicatorType(overlay.id, type, source || (meta?.lib ? "client" : "server"))
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.render()
  }

  applyIndicatorOnEnter(e: KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    this.applySettings()
  }

  applyIndicator() {
    const overlay = this.store.selectedOverlay
    if (!overlay || overlay.mode !== "indicator") return

    const { type, source, params, pinnedTo } = this._readIndicatorInputs(overlay)

    if (source === "server" && !connectionMonitor.requireOnline("apply server indicator")) return

    this.store.setOverlayIndicatorType(overlay.id, type, source ?? undefined)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    this.withChartCtrl(c => {
      if (c.hasOverlay(overlay.id)) c.updateIndicator(overlay.id, type, params, pinnedTo, source ?? undefined)
      else c.addOverlay(overlay)
    })
    this.render()
  }

  switchColorScheme(e: Event) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const rawValue = (e.currentTarget as HTMLElement).dataset.colorScheme ?? (e.currentTarget as HTMLInputElement).value
    const colorScheme = parseInt(rawValue, 10)
    if (!Number.isFinite(colorScheme)) return

    const details = (e.currentTarget as HTMLElement).closest("details")
    if (details) details.open = false

    if (this.store.setOverlayColorScheme(overlay.id, colorScheme)) {
      this.withChartCtrl(c => c.setOverlayColorScheme(overlay.id, colorScheme))
      this.render()
    }
  }

  adjustOverlayOpacity(e: Event) {
    const overlay = this.store.selectedOverlay
    if (!overlay) return

    const percent = parseInt((e.currentTarget as HTMLInputElement).value, 10)
    if (!Number.isFinite(percent)) return
    const opacity = Math.max(0, Math.min(100, percent)) / 100

    const changed = this.store.setOverlayOpacity(overlay.id, opacity)
    this.withChartCtrl(c => c.setOverlayOpacity(overlay.id, opacity))

    const valueEl = this.sidebar.querySelector("[data-opacity-value]")
    if (valueEl) valueEl.textContent = `${Math.round(opacity * 100)}%`

    if (changed && e.type === "change") this.render()
  }

  toggleCustomInput(e: Event) {
    const wrapper = (e.currentTarget as HTMLElement).closest("[data-combo]")
    if (!wrapper) return
    const select = wrapper.querySelector("select") as HTMLSelectElement | null
    const input = wrapper.querySelector("input") as HTMLInputElement | null
    const button = e.currentTarget as HTMLElement

    const updateToggleButton = (manualMode: boolean) => {
      button.textContent = manualMode ? "Manual" : "List"
      button.title = manualMode ? "Current mode: manual input" : "Current mode: list selection"
    }

    if (select?.classList.contains("hidden")) {
      select.classList.remove("hidden")
      input?.classList.add("hidden")
      select.value = input?.value || (select.options[0]?.value ?? "")
      updateToggleButton(false)
    } else {
      select?.classList.add("hidden")
      input?.classList.remove("hidden")
      if (input) input.value = select?.value ?? ""
      input?.focus()
      updateToggleButton(true)
    }
  }

  toggleVolumeProfile() {
    const panel = this.store.selectedPanel
    if (!panel) return
    const vp = panel.volumeProfile ?? { enabled: false, opacity: 0.3 }
    const newEnabled = !vp.enabled
    this.store.setVolumeProfile(panel.id, { enabled: newEnabled })
    this.withChartCtrl(c => newEnabled ? c.enableVolumeProfile(vp.opacity ?? 0.3) : c.disableVolumeProfile())
    this.render()
  }

  adjustVpOpacity(e: Event) {
    const percent = parseInt((e.currentTarget as HTMLInputElement).value, 10)
    if (!Number.isFinite(percent)) return
    const opacity = Math.max(0, Math.min(100, percent)) / 100

    const panel = this.store.selectedPanel
    if (!panel) return

    this.store.setVolumeProfile(panel.id, { opacity })
    this.withChartCtrl(c => c.setVolumeProfileOpacity(opacity))

    const valueEl = this.sidebar.querySelector("[data-vp-opacity-value]")
    if (valueEl) valueEl.textContent = `${Math.round(opacity * 100)}%`

    if (e.type === "change") this.render()
  }

  _readIndicatorInputs(overlay: any): { type: string; source: string | null; params: Record<string, number>; pinnedTo: string | null } {
    const typeEl = this.sidebar.querySelector("[data-field='indicatorType']") as HTMLSelectElement | null
    const raw = typeEl?.value || overlay.indicatorType || "sma"
    const [type, source] = raw.includes("|") ? raw.split("|") : [raw, overlay.indicatorSource || null]

    const paramInputs = this.sidebar.querySelectorAll("[data-indicator-param]")
    const params: Record<string, number> = {}
    paramInputs.forEach((input: Element) => {
      const key = (input as HTMLElement).dataset.indicatorParam
      const val = parseFloat((input as HTMLInputElement).value)
      if (key && !Number.isNaN(val)) params[key] = val
    })

    const pinnedEl = this.sidebar.querySelector("[data-field='pinnedTo']") as HTMLSelectElement | null
    const pinnedTo = pinnedEl?.value || null

    return { type, source, params, pinnedTo }
  }

  private _applyIndicatorSettings(panel: Panel, overlay: any, timeframeChanged: boolean): boolean | null {
    const { type, source, params, pinnedTo } = this._readIndicatorInputs(overlay)

    const needsBackend = timeframeChanged || source === "server"
    if (needsBackend && !connectionMonitor.requireOnline("apply settings")) return null

    let symbolChanged = false
    if (pinnedTo) {
      const sourceOverlay = this.store.overlayById(pinnedTo)
      if (sourceOverlay?.symbol) {
        symbolChanged = this.store.updateOverlaySymbol(overlay.id, sourceOverlay.symbol)
      }
    }

    this.store.setOverlayIndicatorType(overlay.id, type, source ?? undefined)
    this.store.setOverlayIndicatorParams(overlay.id, params)
    this.store.setOverlayPinnedTo(overlay.id, pinnedTo)

    this.withChartCtrl(c => {
      if (c.hasOverlay(overlay.id)) {
        if (!timeframeChanged && !symbolChanged) c.updateIndicator(overlay.id, type, params, pinnedTo, source ?? undefined)
      } else {
        c.addOverlay(overlay)
      }
    })
    return true
  }

  private _applySymbolSettings(overlay: any, timeframeChanged: boolean): boolean | null {
    const symbolEl = this.sidebar.querySelector("[data-field='symbol']:not(.hidden)") as HTMLSelectElement | null
    const symbol = symbolEl?.value?.trim().toUpperCase()
    const willChangeSymbol = symbol && symbol !== overlay.symbol

    if ((timeframeChanged || willChangeSymbol) && !connectionMonitor.requireOnline("change symbol/timeframe")) return null

    if (willChangeSymbol) {
      return this.store.updateOverlaySymbol(overlay.id, symbol)
    }
    return false
  }
}
