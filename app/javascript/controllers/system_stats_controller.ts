import { Controller } from "@hotwired/stimulus"
import type { SystemStats, Trade } from "../types/store"

import { skeletonHTML } from "../system_stats/layout"
import { buildDefaultStatsPanelState, StatsPanel } from "../system_stats/stats_panel"

export default class extends Controller {
  static values = {
    systemId:  String,
    dataTabId: String,
  }

  declare systemIdValue:  string
  declare dataTabIdValue: string

  private panel: StatsPanel | null = null
  private panelState = buildDefaultStatsPanelState()

  connect() {
    this.element.innerHTML = skeletonHTML()
    this._requestStats()
  }

  disconnect() {
    this.panel?.destroy()
    this.panel = null
  }

  /** Called by tabs_controller after stats are computed. */
  setStats(stats: SystemStats | null, trades: Trade[]) {
    if (!stats) {
      this.panel?.destroy()
      this.panel = null
      this.element.innerHTML = `<div class="flex items-center justify-center h-full text-gray-500 text-sm">No data available. Add data to the linked Data tab first.</div>`
      return
    }

    this.panel?.destroy()
    this.panel = new StatsPanel(this.element as HTMLElement, this.panelState)
    this.panel.render(stats, trades)
  }

  private _requestStats() {
    this.element.dispatchEvent(new CustomEvent("systemstats:requestStats", {
      bubbles: true,
      detail: { systemId: this.systemIdValue, dataTabId: this.dataTabIdValue },
    }))
  }
}
