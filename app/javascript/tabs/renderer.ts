import SidebarRenderer from "./sidebar_renderer"
import DataSidebarRenderer from "../data_grid/sidebar_renderer"
import PanelRenderer from "./panel_renderer"
import { tabButtonHTML, addTabButtonHTML } from "../templates/panel_templates"
import type { Tab, Panel } from "../types/store"

export interface TabRenderOpts {
  tabs: Tab[]
  activeTabId: string | null
  selectedPanelId: string | null
  selectedOverlayId: string | null
  symbols: string[]
  timeframes: string[]
  labelFn?: (tab: Tab) => string
  indicators: unknown[]
  labelModeActive: boolean
  lineModeActive: boolean
  vpEnabled: boolean
  vpOpacity: number
  hlModeActive: boolean
  vlModeActive: boolean
}

export default class TabRenderer {
  tabBarEl: HTMLElement
  ctrl: string
  panels: PanelRenderer
  sidebar: SidebarRenderer
  dataSidebar: DataSidebarRenderer

  constructor(tabBarEl: HTMLElement, panelsEl: HTMLElement, sidebarEl: HTMLElement, { controllerName }: { controllerName: string }) {
    this.tabBarEl = tabBarEl
    this.ctrl = controllerName
    this.panels = new PanelRenderer(panelsEl, controllerName)
    this.sidebar = new SidebarRenderer(sidebarEl, controllerName)
    this.dataSidebar = new DataSidebarRenderer(sidebarEl, controllerName)
  }

  render(opts: TabRenderOpts): void {
    const { tabs, activeTabId, selectedPanelId, selectedOverlayId, symbols, timeframes, labelFn, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive } = opts

    this._renderTabBar(tabs, activeTabId, labelFn)

    const activeTab = tabs.find(t => t.id === activeTabId)

    if (activeTab?.type === "data") {
      this.panels.renderDataTab(tabs, activeTabId)
      if (activeTab.dataConfig) {
        this.dataSidebar.setColumns(activeTab.dataConfig.columns)
        this.dataSidebar.setConditions(activeTab.dataConfig.conditions)
      }
      this.dataSidebar.render(activeTab, symbols, timeframes)
    } else {
      this.panels.render(tabs, activeTabId, selectedPanelId)
      this.panels.renderDataTab(tabs, activeTabId)

      let panel: Panel | null = null
      for (const tab of tabs) {
        panel = tab.panels.find(p => p.id === selectedPanelId) ?? null
        if (panel) break
      }
      this.sidebar.render(panel, selectedOverlayId, symbols, timeframes, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive)
    }
  }

  _renderTabBar(tabs: Tab[], activeTabId: string | null, labelFn?: (tab: Tab) => string): void {
    const buttons = tabs.map(tab =>
      tabButtonHTML(this.ctrl, tab.id, labelFn ? labelFn(tab) : "New", tab.id === activeTabId, tabs.length > 1, tab.type || "chart")
    ).join("")

    this.tabBarEl.innerHTML = buttons + addTabButtonHTML(this.ctrl)
  }
}
