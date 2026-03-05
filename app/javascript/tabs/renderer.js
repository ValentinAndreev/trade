import SidebarRenderer from "./sidebar_renderer"
import PanelRenderer from "./panel_renderer"
import { tabButtonHTML, addTabButtonHTML } from "../templates/panel_templates"

export default class TabRenderer {
  constructor(tabBarEl, panelsEl, sidebarEl, { controllerName }) {
    this.tabBarEl = tabBarEl
    this.ctrl = controllerName
    this.panels = new PanelRenderer(panelsEl, controllerName)
    this.sidebar = new SidebarRenderer(sidebarEl, controllerName)
  }

  render(opts) {
    const { tabs, activeTabId, selectedPanelId, selectedOverlayId, symbols, timeframes, labelFn, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive } = opts

    this._renderTabBar(tabs, activeTabId, labelFn)
    this.panels.render(tabs, activeTabId, selectedPanelId)

    let panel = null
    for (const tab of tabs) {
      panel = tab.panels.find(p => p.id === selectedPanelId)
      if (panel) break
    }
    this.sidebar.render(panel, selectedOverlayId, symbols, timeframes, indicators, labelModeActive, lineModeActive, vpEnabled, vpOpacity, hlModeActive, vlModeActive)
  }

  _renderTabBar(tabs, activeTabId, labelFn) {
    const buttons = tabs.map(tab =>
      tabButtonHTML(this.ctrl, tab.id, labelFn ? labelFn(tab) : "New", tab.id === activeTabId, tabs.length > 1)
    ).join("")

    this.tabBarEl.innerHTML = buttons + addTabButtonHTML(this.ctrl)
  }
}
