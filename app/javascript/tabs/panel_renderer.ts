import {
  panelLegendHTML, controlButtonsHTML,
  emptyPanelHTML, chartPanelHTML, dataGridPanelHTML, systemStatsPanelHTML, researchPanelHTML, systemEditorPanelHTML,
} from "../templates/panel_templates"
import type { Tab, Panel } from "../types/store"

export default class PanelRenderer {
  panelsEl: HTMLElement
  ctrl: string

  constructor(panelsEl: HTMLElement, controllerName: string) {
    this.panelsEl = panelsEl
    this.ctrl = controllerName
  }

  render(tabs: Tab[], activeTabId: string | null, selectedPanelId: string | null): void {
    this._ensureWrappers(tabs, activeTabId, (tab, wrapper, isActive) => {
      if (!isActive || tab.type === "data") return
      const maximizedPanels = tab.maximizedPanelId
        ? tab.panels.filter(panel => panel.id === tab.maximizedPanelId)
        : []
      const visiblePanels = maximizedPanels.length ? maximizedPanels : tab.panels
      this._syncPanels(wrapper, visiblePanels, selectedPanelId, maximizedPanels[0]?.id || null)
    })
  }

  renderDataTab(tabs: Tab[], activeTabId: string | null): void {
    this._ensureWrappers(tabs, activeTabId, (tab, wrapper, isActive) => {
      if (wrapper.dataset.tabWrapper !== tab.id) return

      if (tab.type === "system_stats" && tab.systemStatsConfig) {
        if (!isActive) return
        if (!wrapper.querySelector("[data-controller='system-stats']")) {
          wrapper.innerHTML = systemStatsPanelHTML(tab.systemStatsConfig.systemId, tab.systemStatsConfig.dataTabId)
        }
        return
      }

      if (tab.type === "research") {
        if (!isActive) return
        const configJson = JSON.stringify(tab.researchConfig || {})
        const existingResearch = wrapper.querySelector("[data-controller='research']") as HTMLElement | null
        if (existingResearch) {
          if (existingResearch.dataset.researchConfigValue !== configJson) {
            existingResearch.dataset.researchConfigValue = configJson
          }
        } else {
          wrapper.innerHTML = researchPanelHTML(tab.id, configJson)
        }
        return
      }

      if (tab.type === "system_editor") {
        if (!isActive) return
        const configJson = JSON.stringify(tab.systemEditorConfig || {})
        const existingEditor = wrapper.querySelector("[data-controller='system-editor']") as HTMLElement | null
        if (existingEditor) {
          if (existingEditor.dataset.systemEditorConfigValue !== configJson) {
            existingEditor.dataset.systemEditorConfigValue = configJson
          }
        } else {
          wrapper.innerHTML = systemEditorPanelHTML(tab.id, configJson)
        }
        return
      }

      if (tab.type !== "data" || !tab.dataConfig) return
      const hasChartLink = !!tab.dataConfig.chartLinks?.length
      if (!isActive && !hasChartLink) return

      const configJson = JSON.stringify(tab.dataConfig)
      const existingGrid = wrapper.querySelector("[data-controller='data-grid']") as HTMLElement | null
      if (existingGrid) {
        if (existingGrid.dataset.dataGridConfigValue !== configJson) {
          existingGrid.dataset.dataGridConfigValue = configJson
        }
      } else {
        wrapper.innerHTML = dataGridPanelHTML(this.ctrl, configJson)
      }
    })
  }

  private _ensureWrappers(
    tabs: Tab[],
    activeTabId: string | null,
    callback: (tab: Tab, wrapper: HTMLElement, isActive: boolean) => void,
  ): void {
    this.panelsEl.querySelectorAll<HTMLElement>("[data-tab-wrapper]").forEach(wrapper => {
      const tabId = wrapper.dataset.tabWrapper
      if (!tabs.find(t => t.id === tabId)) wrapper.remove()
    })

    tabs.forEach(tab => {
      const isActive = tab.id === activeTabId
      let wrapper = this.panelsEl.querySelector<HTMLElement>(`[data-tab-wrapper="${tab.id}"]`)

      if (!wrapper) {
        wrapper = document.createElement("div")
        wrapper.dataset.tabWrapper = tab.id
        wrapper.className = "flex flex-col h-full"
        this.panelsEl.appendChild(wrapper)
      }

      wrapper.classList.toggle("hidden", !isActive)
      callback(tab, wrapper, isActive)
    })
  }

  _syncPanels(wrapper: HTMLElement, panels: Panel[], selectedPanelId: string | null, maximizedPanelId: string | null): void {
    const existing = new Map<string, HTMLElement>()
    wrapper.querySelectorAll<HTMLElement>(":scope > [data-panel-id]").forEach(el => {
      existing.set(el.dataset.panelId ?? "", el)
    })

    const savedFlex = new Map<string, string>()
    for (const [id, el] of existing) {
      if (el.style.flex) savedFlex.set(id, el.style.flex)
    }

    const removed = this._removeStale(existing, savedFlex, panels)
    if (removed) this._normalizeFlex(existing, savedFlex)

    this._reconcilePanels(wrapper, panels, existing, savedFlex, selectedPanelId, maximizedPanelId)
    this._applyCssOrder(wrapper, panels)
    this._syncDividers(wrapper, panels)
  }

  _removeStale(existing: Map<string, HTMLElement>, savedFlex: Map<string, string>, panels: Panel[]): boolean {
    let removed = false
    for (const [id, el] of existing) {
      if (!panels.find(p => p.id === id)) {
        el.remove()
        existing.delete(id)
        savedFlex.delete(id)
        removed = true
      }
    }
    return removed
  }

  _normalizeFlex(existing: Map<string, HTMLElement>, savedFlex: Map<string, string>): void {
    if (savedFlex.size === 0) return
    let total = 0
    for (const flex of savedFlex.values()) {
      const num = parseFloat(flex)
      if (Number.isFinite(num) && num > 0) total += num
    }
    if (total <= 0 || total === 1) return
    for (const [id, flex] of savedFlex) {
      const num = parseFloat(flex)
      if (Number.isFinite(num) && num > 0) {
        const normalized = `${num / total}`
        savedFlex.set(id, normalized)
        const el = existing.get(id)
        if (el) el.style.flex = normalized
      }
    }
  }

  _reconcilePanels(
    wrapper: HTMLElement,
    panels: Panel[],
    existing: Map<string, HTMLElement>,
    savedFlex: Map<string, string>,
    selectedPanelId: string | null,
    maximizedPanelId: string | null,
  ): void {
    panels.forEach((panel, panelIdx) => {
      const el = existing.get(panel.id)
      const isFirst = panelIdx === 0
      const isLast = panelIdx === panels.length - 1
      const isExpanded = panel.id === maximizedPanelId

      if (el) {
        this._updateExistingPanel(el, panel, existing, savedFlex, selectedPanelId, isFirst, isLast, isExpanded)
        return
      }

      wrapper.insertAdjacentHTML("beforeend", this._buildPanelHTML(panel, selectedPanelId, isFirst, isLast, isExpanded))
    })
  }

  _updateExistingPanel(
    el: HTMLElement,
    panel: Panel,
    existing: Map<string, HTMLElement>,
    savedFlex: Map<string, string>,
    selectedPanelId: string | null,
    isFirst: boolean,
    isLast: boolean,
    isExpanded: boolean,
  ): void {
    const chartEl = el.querySelector<HTMLElement>("[data-controller='chart']")
    const hasChart = !!chartEl
    const needsChart = panel.overlays.some(o => o.symbol)
    const overlaysJson = this._overlaysJson(panel)

    const newKey = this._structuralKey(panel)
    const timeframeChanged = hasChart && chartEl.dataset.chartTimeframeValue !== panel.timeframe
    let structureChanged = false
    if (hasChart && needsChart) {
      if (chartEl.dataset.chartStructuralKey) {
        structureChanged = chartEl.dataset.chartStructuralKey !== newKey
      } else {
        chartEl.dataset.chartStructuralKey = newKey
      }
    }
    const needsRecreate = timeframeChanged || structureChanged

    if (hasChart && !needsRecreate) {
      chartEl.dataset.chartOverlaysValue = overlaysJson
      chartEl.dataset.chartStructuralKey = newKey
    }

    if (needsRecreate || hasChart !== needsChart) {
      const placeholder = document.createElement("template")
      placeholder.innerHTML = this._buildPanelHTML(panel, selectedPanelId, isFirst, isLast, isExpanded)
      const newEl = placeholder.content.firstElementChild as HTMLElement | null
      if (newEl) {
        if (savedFlex.has(panel.id)) newEl.style.flex = savedFlex.get(panel.id) ?? ""
        el.replaceWith(newEl)
      }
      existing.delete(panel.id)
    } else {
      this._updatePanelBorder(el, panel.id === selectedPanelId)
      this._updateMoveButtons(el, panel.id, isFirst, isLast, isExpanded)
    }
  }

  _applyCssOrder(wrapper: HTMLElement, panels: Panel[]): void {
    const panelElMap = new Map<string, HTMLElement>()
    wrapper.querySelectorAll<HTMLElement>(":scope > [data-panel-id]").forEach(el => {
      panelElMap.set(el.dataset.panelId ?? "", el)
    })
    panels.forEach((panel, i) => {
      const el = panelElMap.get(panel.id)
      if (el) el.style.order = String(i * 2)
    })
  }

  _syncDividers(wrapper: HTMLElement, panels: Panel[]): void {
    const orderedPairs: { above: string; below: string }[] = []
    for (let i = 0; i < panels.length - 1; i++) {
      orderedPairs.push({ above: panels[i].id, below: panels[i + 1].id })
    }

    const existingDividers = [...wrapper.querySelectorAll<HTMLElement>(":scope > [data-divider]")]
    const needsRebuild = existingDividers.length !== orderedPairs.length ||
      existingDividers.some((d, i) => d.dataset.above !== orderedPairs[i].above || d.dataset.below !== orderedPairs[i].below)

    if (needsRebuild) {
      existingDividers.forEach(d => d.remove())
      for (let i = 0; i < orderedPairs.length; i++) {
        const divider = document.createElement("div")
        divider.dataset.divider = ""
        divider.dataset.above = orderedPairs[i].above
        divider.dataset.below = orderedPairs[i].below
        divider.className = "h-1.5 shrink-0 cursor-row-resize bg-[#2a2a3e] hover:bg-[#5a5a7e] transition-colors"
        divider.dataset.action = `mousedown->${this.ctrl}#startResize`
        divider.style.order = String(i * 2 + 1)
        wrapper.appendChild(divider)
      }
    } else {
      existingDividers.forEach((d, i) => { d.style.order = String(i * 2 + 1) })
    }
  }

  _updatePanelBorder(panel: HTMLElement, selected: boolean): void {
    panel.classList.toggle("border-blue-500/50", selected)
    panel.classList.toggle("border-[#2a2a3e]", !selected)
  }

  _overlaysJson(panel: Panel): string {
    return JSON.stringify(panel.overlays.filter(o => o.symbol).map(o => ({
      id: o.id,
      symbol: o.symbol,
      mode: o.mode || "price",
      chartType: o.chartType,
      colorScheme: o.colorScheme ?? 0,
      opacity: o.opacity ?? 1,
      visible: o.visible !== false,
      indicatorType: o.indicatorType || null,
      indicatorSource: o.indicatorSource || null,
      indicatorParams: o.indicatorParams || null,
      pinnedTo: o.pinnedTo || null,
    })))
  }

  _structuralKey(panel: Panel): string {
    return panel.overlays
      .filter(o => o.symbol && o.mode !== "indicator")
      .map(o => `${o.id}:${o.symbol}:${o.chartType}`)
      .join("|")
  }

  _updateMoveButtons(el: HTMLElement, panelId: string, isFirst: boolean, isLast: boolean, isExpanded: boolean): void {
    el.querySelectorAll(":scope > .absolute.top-1.right-1").forEach(c => c.remove())
    el.insertAdjacentHTML("afterbegin", controlButtonsHTML(this.ctrl, panelId, isFirst, isLast, isExpanded))
  }

  _buildPanelHTML(panel: Panel, selectedPanelId: string | null, isFirst: boolean, isLast: boolean, isExpanded: boolean): string {
    const selected = panel.id === selectedPanelId
    const borderClass = selected ? "border-blue-500/50" : "border-[#2a2a3e]"
    const hasSymbols = panel.overlays.some(o => o.symbol)
    const buttons = controlButtonsHTML(this.ctrl, panel.id, isFirst, isLast, isExpanded)

    if (!hasSymbols) {
      return emptyPanelHTML(this.ctrl, panel.id, borderClass, buttons)
    }

    return chartPanelHTML(
      this.ctrl, panel.id, borderClass, buttons,
      this._overlaysJson(panel), panel.timeframe,
      this._structuralKey(panel), panelLegendHTML(panel),
    )
  }
}
