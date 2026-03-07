import type { Tab } from "../types/store"

const STORAGE_KEY = "chart-tabs"
const ACTIVE_TAB_KEY = "chart-active-tab"

export function loadTabs(): Tab[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const tabs = JSON.parse(stored)
      if (Array.isArray(tabs)) return tabs as Tab[]
    }
  } catch { /* ignore */ }
  return []
}

export function saveTabs(tabs: Tab[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
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
