import { beforeEach, describe, expect, it, vi } from "vitest"
import AssistantCoordinator from "../../workspace/assistant_coordinator"
import DiagnosticsStore from "../../workspace/diagnostics_store"
import { loadWorkspaceAssistantState, saveWorkspaceAssistantState } from "../../tabs/persistence"
import type { ResearchDslDiagnostic } from "../../research/dsl"
import type TabStore from "../../tabs/store"
import type { Tab, WorkspaceAssistantState } from "../../types/store"

vi.mock("../../services/toast", () => ({
  showToast: vi.fn(),
}))

function systemEditorTab(id = "editor-1", overrides: Partial<Tab["systemEditorConfig"]> = {}): Tab {
  return {
    id,
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

function buildStore(tabs: Tab[]) {
  const store = {
    tabs,
    activeTabId: tabs[0]?.id || null,
    tabLabel: vi.fn((tab: Tab) => tab.name || "System editor"),
    addAssistantTab: vi.fn(),
    addSystemEditorTab: vi.fn((config: Record<string, unknown>) => {
      const tab = systemEditorTab(`editor-${tabs.length + 1}`, config as Partial<Tab["systemEditorConfig"]>)
      tabs.push(tab)
      return tab
    }),
    updateSystemEditorConfig: vi.fn((tabId: string, updates: Record<string, unknown>) => {
      const tab = tabs.find(item => item.id === tabId)
      if (tab?.systemEditorConfig) Object.assign(tab.systemEditorConfig, updates)
      return true
    }),
  }
  return store as unknown as TabStore
}

function buildCoordinator(store: TabStore, state?: WorkspaceAssistantState) {
  if (state) saveWorkspaceAssistantState(state)

  const renderFn = vi.fn()
  const revealActiveTab = vi.fn()
  const diagnosticsStore = new DiagnosticsStore()
  const diagnostics: ResearchDslDiagnostic[] = [{
    message: "Broken YAML",
    line: 1,
    column: 1,
    length: 1,
    path: null,
    code: null,
  }]
  diagnosticsStore.set("editor-1", diagnostics)

  return {
    renderFn,
    revealActiveTab,
    diagnosticsStore,
    coordinator: new AssistantCoordinator({
      store,
      renderFn,
      revealActiveTab,
      diagnosticsStore,
      signal: new AbortController().signal,
    }),
  }
}

function coordinatorState(coordinator: AssistantCoordinator): WorkspaceAssistantState {
  return JSON.parse(coordinator.stateJson()) as WorkspaceAssistantState
}

describe("AssistantCoordinator", () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
      clear: () => { storage.clear() },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size },
    })
    vi.clearAllMocks()
  })

  it("builds linked target context from the current system editor tab", () => {
    const store = buildStore([systemEditorTab()])
    const { coordinator } = buildCoordinator(store, {
      currentChatId: 10,
      provider: "openai",
      linkedTarget: { type: "system_editor", tabId: "editor-1" },
    })

    const context = JSON.parse(coordinator.linkedTargetContextJson())

    expect(context.system_yaml).toContain("id: demo_system")
    expect(context.system_id).toBe("demo_system")
    expect(context.source_path).toBe("systems/demo.yml")
    expect(context.yaml_hash).toEqual(expect.any(String))
    expect(context.diagnostics).toEqual([{
      message: "Broken YAML",
      line: 1,
      column: 1,
      length: 1,
      path: null,
      code: null,
    }])
  })

  it("drops and persists a linked target when the editor tab no longer exists", () => {
    const store = buildStore([])
    const { coordinator } = buildCoordinator(store, {
      currentChatId: 10,
      provider: "openai",
      linkedTarget: { type: "system_editor", tabId: "missing-editor" },
    })

    coordinator.reconcileLinkedTarget()

    expect(loadWorkspaceAssistantState().linkedTarget).toBeNull()
  })

  it("does not persist assistant state after abort", () => {
    const store = buildStore([])
    const abortController = new AbortController()
    const diagnosticsStore = new DiagnosticsStore()
    const coordinator = new AssistantCoordinator({
      store,
      renderFn: vi.fn(),
      revealActiveTab: vi.fn(),
      diagnosticsStore,
      signal: abortController.signal,
    })
    saveWorkspaceAssistantState({
      currentChatId: 10,
      provider: "openai",
      linkedTarget: { type: "system_editor", tabId: "missing-editor" },
    })

    abortController.abort()
    coordinator.reconcileLinkedTarget()

    expect(loadWorkspaceAssistantState().linkedTarget).toEqual({ type: "system_editor", tabId: "missing-editor" })
  })

  it("returns a defensive copy of workspace assistant state", () => {
    const store = buildStore([systemEditorTab()])
    const { coordinator } = buildCoordinator(store, {
      currentChatId: 10,
      provider: "openai",
      linkedTarget: { type: "system_editor", tabId: "editor-1" },
    })

    const state = coordinatorState(coordinator)
    state.currentChatId = 99
    if (state.linkedTarget) state.linkedTarget.tabId = "mutated-editor"

    expect(coordinatorState(coordinator).currentChatId).toBe(10)
    expect(coordinatorState(coordinator).linkedTarget).toEqual({ type: "system_editor", tabId: "editor-1" })
  })

  it("applies a draft to the linked system editor without changing the source identity", () => {
    const tab = systemEditorTab()
    const store = buildStore([tab])
    const diagnosticsStore = new DiagnosticsStore()
    const renderFn = vi.fn()
    const coordinator = new AssistantCoordinator({
      store,
      renderFn,
      revealActiveTab: vi.fn(),
      diagnosticsStore,
      signal: new AbortController().signal,
    })

    coordinator.applyDraftToLinkedEditor(new CustomEvent("assistant:applyDraftToLinkedEditor", {
      detail: {
        yaml: "id: demo_system\nname: Updated\n",
        target: { type: "system_editor", tabId: "editor-1" },
        suggestedSystemId: "different_id",
      },
    }))

    expect(tab.systemEditorConfig?.systemYaml).toContain("Updated")
    expect(tab.systemEditorConfig?.systemId).toBe("demo_system")
    expect(renderFn).toHaveBeenCalled()
  })

  it("opens a draft in a new editor and clears the previous chat context", () => {
    const store = buildStore([systemEditorTab("editor-1")])
    const diagnosticsStore = new DiagnosticsStore()
    const coordinator = new AssistantCoordinator({
      store,
      renderFn: vi.fn(),
      revealActiveTab: vi.fn(),
      diagnosticsStore,
      signal: new AbortController().signal,
    })
    coordinator.linkToSystemEditor("editor-1", false, false)
    coordinator.onStateChanged(new CustomEvent("assistant:stateChanged", {
      detail: { state: { currentChatId: 42, provider: "openai", linkedTarget: { type: "system_editor", tabId: "editor-1" } } },
    }))

    coordinator.openDraftInSystemEditor(new CustomEvent("assistant:openDraftInSystemEditor", {
      detail: {
        yaml: "id: new_system\nname: New System\n",
        suggestedSystemId: "new_system",
      },
    }))

    expect(coordinatorState(coordinator).linkedTarget).toEqual({ type: "system_editor", tabId: "editor-2" })
    expect(coordinatorState(coordinator).currentChatId).toBeNull()
  })

  it("applies a draft to another editor and clears the previous chat context", () => {
    const store = buildStore([systemEditorTab("editor-1"), systemEditorTab("editor-2")])
    const diagnosticsStore = new DiagnosticsStore()
    const coordinator = new AssistantCoordinator({
      store,
      renderFn: vi.fn(),
      revealActiveTab: vi.fn(),
      diagnosticsStore,
      signal: new AbortController().signal,
    })
    coordinator.onStateChanged(new CustomEvent("assistant:stateChanged", {
      detail: { state: { currentChatId: 42, provider: "openai", linkedTarget: { type: "system_editor", tabId: "editor-1" } } },
    }))

    coordinator.applyDraftToLinkedEditor(new CustomEvent("assistant:applyDraftToLinkedEditor", {
      detail: {
        yaml: "id: demo_system\nname: Updated other editor\n",
        target: { type: "system_editor", tabId: "editor-2" },
      },
    }))

    expect(coordinatorState(coordinator).linkedTarget).toEqual({ type: "system_editor", tabId: "editor-2" })
    expect(coordinatorState(coordinator).currentChatId).toBeNull()
  })
})
