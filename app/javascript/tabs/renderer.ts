import SidebarRenderer from "./sidebar_renderer"
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

  constructor(tabBarEl: HTMLElement, panelsEl: HTMLElement, sidebarEl: HTMLElement, { controllerName }: { controllerName: string }) {
    this.tabBarEl = tabBarEl
    this.ctrl = controllerName
    this.panels = new PanelRenderer(panelsEl, controllerName)
    this.sidebar = new SidebarRenderer(sidebarEl, controllerName)
  }

  render(opts: TabRenderOpts): void {
    const { tabs, activeTabId, selectedPanelId, selectedOverlayId, symbols, timeframes, labelFn, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive } = opts

    this._renderTabBar(tabs, activeTabId, labelFn)
    this.panels.render(tabs, activeTabId, selectedPanelId)

    let panel: Panel | null = null
    for (const tab of tabs) {
      panel = tab.panels.find(p => p.id === selectedPanelId) ?? null
      if (panel) break
    }
    this.sidebar.render(panel, selectedOverlayId, symbols, timeframes, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive)
  }

  _renderTabBar(tabs: Tab[], activeTabId: string | null, labelFn?: (tab: Tab) => string): void {
    const buttons = tabs.map(tab =>
      tabButtonHTML(this.ctrl, tab.id, labelFn ? labelFn(tab) : "New", tab.id === activeTabId, tabs.length > 1)
    ).join("")

    this.tabBarEl.innerHTML = buttons + addTabButtonHTML(this.ctrl)
  }
}
