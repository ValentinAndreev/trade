import SidebarRenderer from "./sidebar_renderer"
import DataSidebarRenderer from "../data_grid/sidebar_renderer"
import PanelRenderer from "./panel_renderer"
import { tabButtonHTML, addTabButtonHTML } from "../templates/panel_templates"
import type { Tab, Panel } from "../types/store"
import type { IndicatorInfo } from "../data_grid/sidebar_renderer"

export interface ChartTabOption {
  id: string
  label: string
  primarySymbol: string | null
}

export interface TabRenderOpts {
  tabs: Tab[]
  activeTabId: string | null
  selectedPanelId: string | null
  selectedOverlayId: string | null
  symbols: string[]
  timeframes: string[]
  labelFn?: (tab: Tab) => string
  indicators: IndicatorInfo[]
  labelModeActive: boolean
  lineModeActive: boolean
  vpEnabled: boolean
  vpOpacity: number
  hlModeActive: boolean
  vlModeActive: boolean
  chartTabOptions?: ChartTabOption[]
}

export default class TabRenderer {
  tabBarEl: HTMLElement
  ctrl: string
  sidebarEl: HTMLElement
  panels: PanelRenderer
  sidebar: SidebarRenderer
  dataSidebar: DataSidebarRenderer

  constructor(tabBarEl: HTMLElement, panelsEl: HTMLElement, sidebarEl: HTMLElement, { controllerName }: { controllerName: string }) {
    this.tabBarEl = tabBarEl
    this.ctrl = controllerName
    this.sidebarEl = sidebarEl
    this.panels = new PanelRenderer(panelsEl, controllerName)
    this.sidebar = new SidebarRenderer(sidebarEl, controllerName)
    this.dataSidebar = new DataSidebarRenderer(sidebarEl, controllerName)
  }

  render(opts: TabRenderOpts): void {
    const { tabs, activeTabId, selectedPanelId, selectedOverlayId, symbols, timeframes, labelFn, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive } = opts

    this._renderTabBar(tabs, activeTabId, labelFn)

    const activeTab = tabs.find(t => t.id === activeTabId)

    const hasLinkedData = tabs.some(t => t.type === "data" && t.dataConfig?.chartLinks?.length)

    if (activeTab?.type === "data") {
      this.sidebarEl.hidden = false
      this.panels.renderDataTab(tabs, activeTabId)
      if (activeTab.dataConfig) {
        this.dataSidebar.setColumns(activeTab.dataConfig.columns)
        this.dataSidebar.setConditions(activeTab.dataConfig.conditions)
        this.dataSidebar.setSystems(activeTab.dataConfig.systems ?? [])
      }
      this.dataSidebar.render(activeTab, symbols, timeframes, opts.chartTabOptions || [])
    } else if (activeTab?.type === "system_stats") {
      this.sidebarEl.hidden = true
      this.sidebarEl.innerHTML = ""
      this.panels.renderDataTab(tabs, activeTabId)
    } else {
      this.sidebarEl.hidden = false
      this.panels.render(tabs, activeTabId, selectedPanelId)
      if (hasLinkedData) this.panels.renderDataTab(tabs, activeTabId)

      let panel: Panel | null = null
      for (const tab of tabs) {
        panel = tab.panels.find(p => p.id === selectedPanelId) ?? null
        if (panel) break
      }
      this.sidebar.setLinkedSystems(activeTabId ?? "", tabs)
      this.sidebar.render(panel, selectedOverlayId, symbols, timeframes, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive)
    }
  }

  _renderTabBar(tabs: Tab[], activeTabId: string | null, labelFn?: (tab: Tab) => string): void {
    const parts: string[] = []
    let i = 0

    while (i < tabs.length) {
      const tab = tabs[i]
      if (tab.type === "chart") {
        const group: Tab[] = [tab]
        let j = i + 1
        while (j < tabs.length) {
          const next = tabs[j]
          const isLinkedData = next.type === "data" && next.dataConfig?.chartLinks?.some(l => l.chartTabId === tab.id)
          const isLinkedStats = next.type === "system_stats" && next.systemStatsConfig?.dataTabId !== undefined &&
            tabs.find(t => t.id === next.systemStatsConfig!.dataTabId)?.dataConfig?.chartLinks?.some(l => l.chartTabId === tab.id)
          if (!isLinkedData && !isLinkedStats) break
          group.push(next)
          j++
        }
        if (group.length > 1) {
          const inner = group.map(t =>
            tabButtonHTML(this.ctrl, t.id, labelFn ? labelFn(t) : "New", t.id === activeTabId, tabs.length > 1, t.type || "chart", true)
          ).join("")
          const chartId = tab.id
          const groupHandle = `<span class="tab-drag-handle inline-flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 hover:bg-white/10 shrink-0" draggable="true" data-action="click->${this.ctrl}#tabDragHandleClick dragstart->${this.ctrl}#tabDragStart dragend->${this.ctrl}#tabDragEnd" title="Drag to reorder">&#8942;</span>`
          parts.push(`<div data-tab-id="${chartId}" data-drag-tab-id="${chartId}" data-action="dragover->${this.ctrl}#tabDragOver dragleave->${this.ctrl}#tabDragLeave drop->${this.ctrl}#tabDrop" class="inline-flex items-stretch border border-blue-400/40 rounded-lg bg-blue-500/5">${groupHandle}${inner}</div>`)
          i = j
          continue
        }
      }

      // Standalone system_stats tab (unlinked from chart)
      if (tab.type === "data") {
        const statsGroup: Tab[] = [tab]
        let j = i + 1
        while (j < tabs.length && tabs[j].type === "system_stats" && tabs[j].systemStatsConfig?.dataTabId === tab.id) {
          statsGroup.push(tabs[j])
          j++
        }
        if (statsGroup.length > 1) {
          const inner = statsGroup.map(t =>
            tabButtonHTML(this.ctrl, t.id, labelFn ? labelFn(t) : "New", t.id === activeTabId, tabs.length > 1, t.type || "data", true)
          ).join("")
          parts.push(`<div class="inline-flex items-stretch border border-blue-400/40 rounded-lg bg-blue-500/5">${inner}</div>`)
          i = j
          continue
        }
      }

      parts.push(tabButtonHTML(this.ctrl, tab.id, labelFn ? labelFn(tab) : "New", tab.id === activeTabId, tabs.length > 1, tab.type || "chart"))
      i++
    }

    this.tabBarEl.innerHTML = parts.join("") + addTabButtonHTML(this.ctrl)
  }
}
