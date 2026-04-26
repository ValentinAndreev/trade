import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LinkedDataCoordinator from "../../workspace/linked_data_coordinator"
import { LINKED_DATA_REFRESH_MS, SYSTEM_STATS_RETRY_DELAY_MS } from "../../config/constants"
import type TabStore from "../../tabs/store"
import type DataTabActions from "../../tabs/data_actions"
import type { DataGridControllerAPI } from "../../types/store"
import type { Tab } from "../../types/store"

function dataTab(): Tab {
  return {
    id: "data-1",
    name: null,
    type: "data",
    panels: [],
    dataConfig: {
      symbols: ["BTCUSD"],
      timeframe: "1h",
      columns: [],
      conditions: [],
      systems: [],
      chartLinks: [{ chartTabId: "chart-1", panelId: "panel-1" }],
    },
  }
}

function defaultDeps(overrides: Partial<TabStore> = {}) {
  return {
    store: overrides as unknown as TabStore,
    dataActions: { loadDataGrid: vi.fn() } as unknown as DataTabActions,
    panelsTarget: document.createElement("main"),
    application: { getControllerForElementAndIdentifier: vi.fn() },
    renderFn: vi.fn(),
    getDataGridController: vi.fn(() => null) as (tabId: string) => DataGridControllerAPI | null,
    getSystemStatsController: vi.fn(() => null),
    signal: new AbortController().signal,
  }
}

describe("LinkedDataCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts periodic refresh only for an active linked data tab", () => {
    const tab = dataTab()
    const loadDataGrid = vi.fn()
    const coordinator = new LinkedDataCoordinator({
      ...defaultDeps({
        activeTab: tab,
        isLinkedDataTab: vi.fn(() => true),
      }),
      dataActions: { loadDataGrid } as unknown as DataTabActions,
    })

    coordinator.startRefreshIfActive()
    vi.advanceTimersByTime(LINKED_DATA_REFRESH_MS)

    expect(loadDataGrid).toHaveBeenCalledTimes(1)
    coordinator.disconnect()
  })

  it("forwards data-grid column state changes through TabStore and rerenders", () => {
    const reorderDataColumns = vi.fn(() => true)
    const renderFn = vi.fn()
    const coordinator = new LinkedDataCoordinator({
      ...defaultDeps({ reorderDataColumns }),
      renderFn,
    })

    coordinator.onColumnStateChanged(new CustomEvent("datagrid:columnStateChanged", {
      detail: { tabId: "data-1", columnIds: ["close", "volume"], widths: { close: 120 } },
    }))

    expect(reorderDataColumns).toHaveBeenCalledWith("data-1", ["close", "volume"], { close: 120 })
    expect(renderFn).toHaveBeenCalled()
  })

  it("re-evaluates refresh state after a tab is removed", () => {
    const tab = dataTab()
    const chartTab = { id: "chart-1", name: null, type: "chart", panels: [] } as Tab
    const loadDataGrid = vi.fn()
    const store = {
      activeTab: tab,
      isLinkedDataTab: vi.fn((item: Tab) => item.type === "data"),
    }
    const coordinator = new LinkedDataCoordinator({
      ...defaultDeps(store),
      dataActions: { loadDataGrid } as unknown as DataTabActions,
    })

    coordinator.startRefreshIfActive()
    vi.advanceTimersByTime(LINKED_DATA_REFRESH_MS)
    store.activeTab = chartTab
    coordinator.onTabRemoved("data-1")
    vi.advanceTimersByTime(LINKED_DATA_REFRESH_MS)

    expect(loadDataGrid).toHaveBeenCalledTimes(1)
  })

  it("cancels pending system stats retries on disconnect", () => {
    const tab = dataTab()
    if (tab.dataConfig) tab.dataConfig.systems = [{ id: "system-1", name: "System 1", enabled: true }]
    const coordinator = new LinkedDataCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        isLinkedDataTab: vi.fn(() => false),
      }),
    })

    coordinator.onSystemStatsRequest(new CustomEvent("systemstats:requestStats", {
      detail: { systemId: "system-1", dataTabId: "data-1" },
    }))
    expect(vi.getTimerCount()).toBe(1)

    coordinator.disconnect()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(SYSTEM_STATS_RETRY_DELAY_MS)
  })

  it("deduplicates pending system stats retries for the same system and data tab", () => {
    const tab = dataTab()
    if (tab.dataConfig) tab.dataConfig.systems = [{ id: "system-1", name: "System 1", enabled: true }]
    const coordinator = new LinkedDataCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: tab,
        isLinkedDataTab: vi.fn(() => false),
      }),
    })

    const event = new CustomEvent("systemstats:requestStats", {
      detail: { systemId: "system-1", dataTabId: "data-1" },
    })
    coordinator.onSystemStatsRequest(event)
    coordinator.onSystemStatsRequest(event)

    expect(vi.getTimerCount()).toBe(1)
    coordinator.disconnect()
  })

  it("cancels pending system stats retries when their data tab is removed", () => {
    const tab = dataTab()
    if (tab.dataConfig) tab.dataConfig.systems = [{ id: "system-1", name: "System 1", enabled: true }]
    const coordinator = new LinkedDataCoordinator({
      ...defaultDeps({
        tabs: [tab],
        activeTab: undefined,
        isLinkedDataTab: vi.fn(() => false),
      }),
    })

    coordinator.onSystemStatsRequest(new CustomEvent("systemstats:requestStats", {
      detail: { systemId: "system-1", dataTabId: "data-1" },
    }))
    expect(vi.getTimerCount()).toBe(1)

    coordinator.onTabRemoved("data-1")

    expect(vi.getTimerCount()).toBe(0)
  })
})
