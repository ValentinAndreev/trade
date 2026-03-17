import type { Tab } from "../types/store"
import { buildDefaultResearchState } from "../research/state"
import { buildDefaultSystemEditorState } from "../system_editor/state"

const STORAGE_KEY = "chart-tabs"
const ACTIVE_TAB_KEY = "chart-active-tab"

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
          if (tab.type === "research" && !tab.researchConfig) {
            tab.researchConfig = buildDefaultResearchState(null)
          }
          if (tab.type === "research" && !tab.researchResult) {
            tab.researchResult = { runs: [], selectedRunIndex: 0 }
          }
          if (tab.type === "system_editor" && !tab.systemEditorConfig) {
            tab.systemEditorConfig = buildDefaultSystemEditorState()
          }
          return tab
        })
        // Build set of all valid system IDs across all data tabs
        const validSystemIds = new Set<string>()
        for (const tab of normalized) {
          if (tab.type === "data" && tab.dataConfig?.systems) {
            for (const sys of tab.dataConfig.systems) validSystemIds.add(sys.id)
          }
        }
        // Drop orphaned system_stats tabs whose system no longer exists
        return normalized.filter(tab =>
          tab.type !== "system_stats" || validSystemIds.has(tab.systemStatsConfig?.systemId ?? "")
        )
      }
    }
  } catch { /* ignore */ }
  return []
}

export function saveTabs(tabs: Tab[]): void {
  const storableTabs = tabs.map(tab => {
    if (tab.type !== "research") return tab
    return {
      ...tab,
      researchResult: undefined,
    }
  })

  localStorage.setItem(STORAGE_KEY, JSON.stringify(storableTabs))
}

export function loadActiveTabId(): string | null {
  return localStorage.getItem(ACTIVE_TAB_KEY)
}

export function saveActiveTabId(tabId: string): void {
  localStorage.setItem(ACTIVE_TAB_KEY, tabId)
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
