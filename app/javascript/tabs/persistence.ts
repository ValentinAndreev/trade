import type { Tab, WorkspaceAssistantState } from "../types/store"
import { buildDefaultResearchState } from "../research/state"
import { hydrateSystemEditorState } from "../system_editor/state"
import { buildDefaultWorkspaceAssistantState, hydrateWorkspaceAssistantState } from "../assistant/state"

const STORAGE_KEY = "chart-tabs"
const ACTIVE_TAB_KEY = "chart-active-tab"
const WORKSPACE_ASSISTANT_STATE_KEY = "workspace-assistant-state"

export function loadTabs(): Tab[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const tabs = JSON.parse(stored)
      if (Array.isArray(tabs)) {
        const normalized = (tabs as Tab[]).map(tab => {
          if (tab.type === "data" && tab.dataConfig && !Array.isArray(tab.dataConfig.systems)) {
            tab.dataConfig.systems = []
          }
          if (tab.type === "research") {
            tab.researchConfig = {
              ...buildDefaultResearchState(null),
              ...(tab.researchConfig || {}),
            }
          }
          if (tab.type === "research" && !tab.researchResult) {
            tab.researchResult = { runs: [], selectedRunIndex: 0 }
          }
          if (tab.type === "system_editor") {
            tab.systemEditorConfig = hydrateSystemEditorState(tab.systemEditorConfig || {})
          }
          if (tab.type === "ml_models") {
            tab.mlModelsConfig = {
              selectedModelKey: null,
              ...(tab.mlModelsConfig || {}),
            }
          }
          return tab
        })
        let assistantTabSeen = false
        let mlModelsTabSeen = false
        const deduped = normalized.filter(tab => {
          if (tab.type === "assistant") {
            if (assistantTabSeen) return false
            assistantTabSeen = true
          }
          if (tab.type === "ml_models") {
            if (mlModelsTabSeen) return false
            mlModelsTabSeen = true
          }
          return true
        })
        // Build set of all valid system IDs across all data tabs
        const validSystemIds = new Set<string>()
        for (const tab of deduped) {
          if (tab.type === "data" && tab.dataConfig?.systems) {
            for (const sys of tab.dataConfig.systems) validSystemIds.add(sys.id)
          }
        }
        // Drop orphaned system_stats tabs whose system no longer exists
        return deduped.filter(tab =>
          tab.type !== "system_stats" || validSystemIds.has(tab.systemStatsConfig?.systemId ?? "")
        )
      }
    }
  } catch { /* ignore */ }
  return []
}

export function saveTabs(tabs: Tab[]): void {
  const storableTabs = tabs.map(tab => {
    const next = { ...tab }

    if (next.type === "research") {
      return {
        ...next,
        researchResult: undefined,
      }
    }

    return next
  })

  localStorage.setItem(STORAGE_KEY, JSON.stringify(storableTabs))
}

export function loadActiveTabId(): string | null {
  return localStorage.getItem(ACTIVE_TAB_KEY)
}

export function saveActiveTabId(tabId: string): void {
  localStorage.setItem(ACTIVE_TAB_KEY, tabId)
}

export function loadWorkspaceAssistantState(): WorkspaceAssistantState {
  try {
    const stored = localStorage.getItem(WORKSPACE_ASSISTANT_STATE_KEY)
    if (!stored) return buildDefaultWorkspaceAssistantState()

    return hydrateWorkspaceAssistantState(JSON.parse(stored) as Partial<WorkspaceAssistantState>)
  } catch {
    return buildDefaultWorkspaceAssistantState()
  }
}

export function saveWorkspaceAssistantState(state: WorkspaceAssistantState): void {
  localStorage.setItem(WORKSPACE_ASSISTANT_STATE_KEY, JSON.stringify(state))
}

export function clearWorkspaceAssistantState(): void {
  localStorage.removeItem(WORKSPACE_ASSISTANT_STATE_KEY)
}

export function calcNextId(tabs: Tab[], prefix: string): number {
  let max = 0
  for (const tab of tabs) {
    if (tab.type === "data") continue
    for (const p of tab.panels) {
      if (prefix === "p") {
        const n = parseInt(p.id.split("-")[1])
        if (n > max) max = n
      }
      if (prefix === "o" && p.overlays) {
        for (const o of p.overlays) {
          const n = parseInt(o.id.split("-")[1])
          if (n > max) max = n
        }
      }
    }
  }
  return max + 1
}
