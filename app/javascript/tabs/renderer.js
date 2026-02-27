import SidebarRenderer from "./sidebar_renderer"
import PanelRenderer from "./panel_renderer"

export default class TabRenderer {
  constructor(tabBarEl, panelsEl, sidebarEl, { controllerName }) {
    this.tabBarEl = tabBarEl
    this.controllerName = controllerName
    this.panels = new PanelRenderer(panelsEl, controllerName)
    this.sidebar = new SidebarRenderer(sidebarEl, controllerName)
  }

  render(tabs, activeTabId, selectedPanelId, selectedOverlayId, symbols, timeframes, labelFn, indicators, labelModeActive, lineModeActive) {
    this._renderTabBar(tabs, activeTabId, labelFn)
    this.panels.render(tabs, activeTabId, selectedPanelId)

    let panel = null
    for (const tab of tabs) {
      panel = tab.panels.find(p => p.id === selectedPanelId)
      if (panel) break
    }
    this.sidebar.render(panel, selectedOverlayId, symbols, timeframes, indicators, labelModeActive, lineModeActive)
  }

  // --- Tab Bar ---

  _renderTabBar(tabs, activeTabId, labelFn) {
    const buttons = tabs.map(tab => {
      const active = tab.id === activeTabId
      const label = labelFn ? labelFn(tab) : "New"
      return `
        <button
          data-tab-id="${tab.id}"
          data-action="click->${this.controllerName}#switchTab"
          class="flex items-center gap-2 px-4 py-2 text-base font-medium cursor-pointer whitespace-nowrap
                 ${active
                   ? "text-white border-b-2 border-blue-400"
                   : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent"}"
        >
          <span
            data-tab-label
            data-action="dblclick->${this.controllerName}#startRename"
            title="Double-click to rename tab"
          >${label}</span>
          ${tabs.length > 1 ? `
            <span
              data-action="click->${this.controllerName}#removeTab"
              title="Remove tab"
              class="ml-1 inline-flex w-6 h-6 items-center justify-center rounded text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-sm leading-none"
            >&times;</span>
          ` : ""}
        </button>
      `
    }).join("")

    const addBtn = `
      <button
        data-action="click->${this.controllerName}#addTab"
        class="px-3 py-2 text-gray-400 hover:text-white text-2xl leading-none cursor-pointer"
        title="Add new tab"
      >+</button>
    `

    this.tabBarEl.innerHTML = buttons + addBtn
  }
}
