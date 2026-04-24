import { generateTrades, computeSystemStats } from "../data_grid/engines"
import { LINKED_DATA_REFRESH_MS, SYSTEM_STATS_RETRY_DELAY_MS, SYSTEM_STATS_MAX_RETRIES } from "../config/constants"
import type { DataGridControllerAPI, SystemStats, Trade } from "../types/store"
import type { LinkedDataDeps } from "./types"

interface SystemStatsControllerAPI {
  setStats(stats: SystemStats | null, trades: Trade[]): void
}

export default class LinkedDataCoordinator {
  private refreshInterval: ReturnType<typeof setInterval> | null = null
  private statsRetryTimeouts = new Map<string, { dataTabId: string; timeout: ReturnType<typeof setTimeout> }>()
  private disconnected = false

  constructor(private deps: LinkedDataDeps) {}

  disconnect(): void {
    this.disconnected = true
    this.stopRefresh()
    this.clearStatsRetryTimeouts()
  }

  onActiveTabChanged(): void {
    this.startRefreshIfActive()
  }

  onTabRemoved(tabId: string): void {
    this.clearStatsRetryTimeoutsForTab(tabId)
    this.onActiveTabChanged()
  }

  onColumnStateChanged(e: Event): void {
    const detail = (e as CustomEvent<{ tabId: string; columnIds: string[]; widths?: Record<string, number> }>).detail
    const tabId = detail?.tabId
    if (tabId && detail?.columnIds?.length && this.deps.store.reorderDataColumns(tabId, detail.columnIds, detail.widths)) {
      this.deps.renderFn()
    }
  }

  onOpenSystemStats(e: Event): void {
    const { systemId } = (e as CustomEvent<{ systemId: string }>).detail
    const dataTab = this.deps.store.activeTab
    if (!dataTab || dataTab.type !== "data" || !dataTab.dataConfig) return
    const system = (dataTab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!system) return
    this.deps.store.addSystemStatsTab(systemId, dataTab.id, system.name)
    this.deps.renderFn()
    this.deliverSystemStats(systemId, dataTab.id)
  }

  onSystemStatsRequest(e: Event): void {
    const { systemId, dataTabId } = (e as CustomEvent<{ systemId: string; dataTabId: string }>).detail
    this.deliverSystemStats(systemId, dataTabId)
  }

  startRefreshIfActive(): void {
    if (this.disconnected) return
    const tab = this.deps.store.activeTab
    if (!tab || !this.deps.store.isLinkedDataTab(tab)) {
      this.stopRefresh()
      return
    }
    if (this.refreshInterval) return
    this.refreshInterval = setInterval(() => this.deps.dataActions.loadDataGrid(), LINKED_DATA_REFRESH_MS)
  }

  private stopRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
  }

  private clearStatsRetryTimeouts(): void {
    this.statsRetryTimeouts.forEach(({ timeout }) => clearTimeout(timeout))
    this.statsRetryTimeouts.clear()
  }

  private clearStatsRetryTimeoutsForTab(dataTabId: string): void {
    this.statsRetryTimeouts.forEach((retry, key) => {
      if (retry.dataTabId !== dataTabId) return
      clearTimeout(retry.timeout)
      this.statsRetryTimeouts.delete(key)
    })
  }

  private scheduleSystemStatsRetry(systemId: string, dataTabId: string, attempt: number): void {
    if (this.disconnected) return
    const key = this.statsRetryKey(systemId, dataTabId)
    const existingRetry = this.statsRetryTimeouts.get(key)
    if (existingRetry) clearTimeout(existingRetry.timeout)

    const timeoutId = setTimeout(() => {
      if (this.statsRetryTimeouts.get(key)?.timeout !== timeoutId) return
      this.statsRetryTimeouts.delete(key)
      this.deliverSystemStats(systemId, dataTabId, attempt)
    }, SYSTEM_STATS_RETRY_DELAY_MS)
    this.statsRetryTimeouts.set(key, { dataTabId, timeout: timeoutId })
  }

  private statsRetryKey(systemId: string, dataTabId: string): string {
    return JSON.stringify([systemId, dataTabId])
  }

  private deliverSystemStats(systemId: string, dataTabId: string, attempt = 0): void {
    if (this.disconnected) return

    const dataTab = this.deps.store.tabs.find(t => t.id === dataTabId)
    if (!dataTab?.dataConfig) return
    const system = (dataTab.dataConfig.systems ?? []).find(s => s.id === systemId)
    if (!system) return

    const app = this.deps.application
    const dataWrapper = this.deps.panelsTarget.querySelector(`[data-tab-wrapper="${dataTabId}"]`) as HTMLElement | null
    const gridEl = dataWrapper?.querySelector("[data-controller='data-grid']") as HTMLElement | null
    const gridCtrl = gridEl
      ? app.getControllerForElementAndIdentifier(gridEl, "data-grid") as DataGridControllerAPI | null
      : null

    const rows = gridCtrl?.getData() ?? []

    if ((!gridCtrl || !rows.length) && attempt < SYSTEM_STATS_MAX_RETRIES) {
      this.scheduleSystemStatsRetry(systemId, dataTabId, attempt + 1)
      return
    }

    const trades = generateTrades(system, rows)
    const stats = computeSystemStats(trades)

    const statsWrapper = this.deps.panelsTarget.querySelector(`[data-system-stats-system-id-value="${systemId}"]`) as HTMLElement | null
    if (!statsWrapper) return
    const statsCtrl = app.getControllerForElementAndIdentifier(statsWrapper, "system-stats")
    if (!this.isSystemStatsController(statsCtrl)) return
    statsCtrl.setStats(stats, trades)
  }

  private isSystemStatsController(controller: unknown): controller is SystemStatsControllerAPI {
    return !!controller && typeof (controller as { setStats?: unknown }).setStats === "function"
  }
}
