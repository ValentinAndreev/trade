import { beforeEach, describe, expect, it, vi } from "vitest"

import { ColumnActions } from "../../tabs/data_actions/column_actions"
import type { DataTabContext } from "../../tabs/data_actions/types"
import type { Tab } from "../../types/store"

function buildContext(sidebar: HTMLElement, activeTab: Tab): {
  actions: ColumnActions
  addDataColumn: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  renderFn: ReturnType<typeof vi.fn>
} {
  const addDataColumn = vi.fn()
  const render = vi.fn()
  const renderFn = vi.fn()
  const ctx = {
    deps: {
      store: {
        get activeTab() { return activeTab },
        addDataColumn,
      },
      renderer: {},
      chartBridge: {},
      sidebarTarget: sidebar,
      panelsTarget: document.createElement("div"),
      element: document.createElement("div"),
      config: { symbols: ["BTCUSD"], indicators: [] },
      application: {},
      renderFn,
    },
    getGridCtrl: vi.fn(() => null),
    render,
    syncChartBridge: vi.fn(),
    updateConditionStyles: vi.fn(),
    addMissingIndicators: vi.fn(),
  } as unknown as DataTabContext

  return { actions: new ColumnActions(ctx), addDataColumn, render, renderFn }
}

function dataTab(): Tab {
  return {
    id: "tab-1",
    name: "Data: BTCUSD",
    type: "data",
    panels: [],
    dataConfig: {
      symbols: ["BTCUSD"],
      timeframe: "1h",
      columns: [],
      conditions: [],
      chartLinks: [],
    },
  }
}

describe("ColumnActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("rejects malformed ML prediction output values at the DOM boundary", () => {
    const sidebar = document.createElement("div")
    sidebar.innerHTML = `
      <select data-field="newColumnType"><option value="ml_prediction" selected>ML Prediction</option></select>
      <input data-field="mlModelKey" value="btc_direction_v1">
      <select data-field="mlModelOutput"><option value="" selected></option></select>
    `
    const { actions, addDataColumn, render, renderFn } = buildContext(sidebar, dataTab())

    actions.addColumn()

    expect(addDataColumn).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
    expect(renderFn).not.toHaveBeenCalled()
  })
})
