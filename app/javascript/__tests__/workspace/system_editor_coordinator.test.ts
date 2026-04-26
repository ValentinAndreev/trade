import { describe, expect, it, vi } from "vitest"
import SystemEditorCoordinator from "../../workspace/system_editor_coordinator"
import DiagnosticsStore from "../../workspace/diagnostics_store"
import type TabStore from "../../tabs/store"
import type { Tab } from "../../types/store"
import type AssistantCoordinator from "../../workspace/assistant_coordinator"
import type ResearchCoordinator from "../../workspace/research_coordinator"

function systemEditorTab(overrides: Partial<Tab["systemEditorConfig"]> = {}): Tab {
  return {
    id: "editor-1",
    name: null,
    type: "system_editor",
    panels: [],
    systemEditorConfig: {
      systemId: "demo_system",
      sourceSystemId: "demo_system",
      sourcePath: "systems/demo.yml",
      directoryPath: "systems",
      systemYaml: "id: demo_system\nname: Demo\n",
      searchQuery: "",
      ...overrides,
    },
  }
}

function coordinatorDeps(store: Partial<TabStore>, renderFn = vi.fn(), assistant: Partial<AssistantCoordinator> = {}) {
  return {
    store: store as unknown as TabStore,
    config: { symbols: ["BTCUSD"], timeframes: ["1h"], indicators: [] },
    research: { refreshCatalog: vi.fn(() => Promise.resolve(true)) } as unknown as ResearchCoordinator,
    assistant: {
      isLinkedToSystemEditor: vi.fn(() => false),
      ...assistant,
    } as unknown as AssistantCoordinator,
    diagnosticsStore: new DiagnosticsStore(),
    renderFn,
    revealActiveTab: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("SystemEditorCoordinator", () => {
  it("updates changed config and stores diagnostics", () => {
    const tab = systemEditorTab()
    const updateSystemEditorConfig = vi.fn((tabId: string, updates: Record<string, unknown>) => {
      if (tab.id === tabId && tab.systemEditorConfig) Object.assign(tab.systemEditorConfig, updates)
      return true
    })
    const coordinator = new SystemEditorCoordinator(coordinatorDeps({
      tabs: [tab],
      activeTab: tab,
      updateSystemEditorConfig,
    }))

    coordinator.onConfigChanged(new CustomEvent("systemeditor:configChanged", {
      detail: {
        tabId: "editor-1",
        config: { ...tab.systemEditorConfig, systemYaml: "id: demo_system\nname: Updated\n" },
        diagnostics: [{ severity: "error", message: "Broken" }],
      },
    }))

    expect(updateSystemEditorConfig).toHaveBeenCalledWith("editor-1", expect.objectContaining({ systemYaml: expect.stringContaining("Updated") }))
    expect(coordinator.diagnosticsFor("editor-1")).toEqual([{ severity: "error", message: "Broken" }])
  })

  it("does not rerender the active editor while its own config changes", () => {
    const tab = systemEditorTab()
    const renderFn = vi.fn()
    const updateSystemEditorConfig = vi.fn((tabId: string, updates: Record<string, unknown>) => {
      if (tab.id === tabId && tab.systemEditorConfig) Object.assign(tab.systemEditorConfig, updates)
      return true
    })
    const coordinator = new SystemEditorCoordinator(coordinatorDeps({
      tabs: [tab],
      activeTab: tab,
      updateSystemEditorConfig,
    }, renderFn))

    coordinator.onConfigChanged(new CustomEvent("systemeditor:configChanged", {
      detail: {
        tabId: "editor-1",
        config: { ...tab.systemEditorConfig, searchQuery: "new search" },
      },
    }))

    expect(renderFn).not.toHaveBeenCalled()
  })

  it("rerenders assistant when linked editor config changes", () => {
    const tab = systemEditorTab()
    const renderFn = vi.fn()
    const updateSystemEditorConfig = vi.fn((tabId: string, updates: Record<string, unknown>) => {
      if (tab.id === tabId && tab.systemEditorConfig) Object.assign(tab.systemEditorConfig, updates)
      return true
    })
    const coordinator = new SystemEditorCoordinator(coordinatorDeps({
      tabs: [tab, { id: "assistant-1", name: null, type: "assistant", panels: [] } as Tab],
      activeTab: { id: "assistant-1", name: null, type: "assistant", panels: [] } as Tab,
      updateSystemEditorConfig,
    }, renderFn, {
      isLinkedToSystemEditor: vi.fn(() => true),
    }))

    coordinator.onConfigChanged(new CustomEvent("systemeditor:configChanged", {
      detail: {
        tabId: "editor-1",
        config: { ...tab.systemEditorConfig, searchQuery: "new search" },
      },
    }))

    expect(renderFn).toHaveBeenCalled()
  })

  it("renders after successful catalog refresh", async () => {
    const renderFn = vi.fn()
    const coordinator = new SystemEditorCoordinator({
      store: { tabs: [] } as unknown as TabStore,
      config: { symbols: ["BTCUSD"], timeframes: ["1h"], indicators: [] },
      research: { refreshCatalog: vi.fn(() => Promise.resolve(true)) } as unknown as ResearchCoordinator,
      assistant: { isLinkedToSystemEditor: vi.fn(() => false) } as unknown as AssistantCoordinator,
      diagnosticsStore: new DiagnosticsStore(),
      renderFn,
      revealActiveTab: vi.fn(),
      signal: new AbortController().signal,
    })

    await coordinator.onCatalogChanged(new Event("systemeditor:catalogChanged"))

    expect(renderFn).toHaveBeenCalledTimes(1)
  })

  it("does not render after catalog refresh failure", async () => {
    const renderFn = vi.fn()
    const coordinator = new SystemEditorCoordinator({
      store: { tabs: [] } as unknown as TabStore,
      config: { symbols: ["BTCUSD"], timeframes: ["1h"], indicators: [] },
      research: { refreshCatalog: vi.fn(() => Promise.resolve(false)) } as unknown as ResearchCoordinator,
      assistant: { isLinkedToSystemEditor: vi.fn(() => false) } as unknown as AssistantCoordinator,
      diagnosticsStore: new DiagnosticsStore(),
      renderFn,
      revealActiveTab: vi.fn(),
      signal: new AbortController().signal,
    })

    await coordinator.onCatalogChanged(new Event("systemeditor:catalogChanged"))

    expect(renderFn).not.toHaveBeenCalled()
  })

  it("does not render catalog refresh results after abort", async () => {
    let resolveRefresh: (value: boolean) => void = () => {}
    const refreshCatalog = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveRefresh = resolve
    }))
    const renderFn = vi.fn()
    const abortController = new AbortController()
    const coordinator = new SystemEditorCoordinator({
      store: { tabs: [] } as unknown as TabStore,
      config: { symbols: ["BTCUSD"], timeframes: ["1h"], indicators: [] },
      research: { refreshCatalog } as unknown as ResearchCoordinator,
      assistant: { isLinkedToSystemEditor: vi.fn(() => false) } as unknown as AssistantCoordinator,
      diagnosticsStore: new DiagnosticsStore(),
      renderFn,
      revealActiveTab: vi.fn(),
      signal: abortController.signal,
    })

    const refresh = coordinator.onCatalogChanged(new Event("systemeditor:catalogChanged"))
    abortController.abort()
    resolveRefresh(true)
    await refresh

    expect(refreshCatalog).toHaveBeenCalled()
    expect(renderFn).not.toHaveBeenCalled()
  })
})
