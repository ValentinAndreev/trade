import { normalizeColorScheme, normalizeOpacity } from "../utils/color"
import type { Tab, Panel, Overlay } from "../types/store"

const STORAGE_KEY = "chart-tabs"
const ACTIVE_TAB_KEY = "chart-active-tab"
const DEFAULT_TABS: Tab[] = []

export function loadTabs(): Tab[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const tabs = JSON.parse(stored)
      if (Array.isArray(tabs)) {
        return tabs.map(t => _migrateTab(t))
      }
    }
  } catch { /* ignore */ }
  return structuredClone(DEFAULT_TABS)
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

function _migrateTab(t: Record<string, any>): Tab {
  // Very old format: { id, symbol, timeframe, mode, name } (no panels)
  if (!t.panels) {
    return {
      id: t.id,
      name: t.name ?? null,
      panels: [{
        id: `p-${t.id.split("-")[1]}`,
        timeframe: t.timeframe || "1m",
        overlays: [{
          id: `o-${t.id.split("-")[1]}`,
          symbol: t.symbol ?? null,
          mode: t.mode || "price",
          chartType: "Candlestick",
          visible: true,
          colorScheme: 0,
          opacity: 1,
          indicatorType: null,
          indicatorParams: null,
          pinnedTo: null,
        }],
      }],
    }
  }

  // Migrate panels
  return {
    id: t.id,
    name: t.name ?? null,
    panels: (t.panels as Record<string, any>[]).map((p: Record<string, any>) => _migratePanel(p)),
  }
}

function _migratePanel(p: Record<string, any>): Panel {
  // Already has overlays — just ensure defaults
  if (p.overlays) {
    return {
      id: p.id,
      timeframe: p.timeframe || "1m",
      overlays: (p.overlays as Record<string, any>[]).map((o: Record<string, any>, idx: number): Overlay => ({
        id: o.id,
        symbol: o.symbol ?? null,
        mode: (o.mode || "price") as "price" | "volume" | "indicator",
        chartType: o.chartType || "Candlestick",
        visible: o.visible !== false,
        colorScheme: normalizeColorScheme(o.colorScheme ?? idx),
        opacity: normalizeOpacity(o.opacity),
        indicatorType: o.indicatorType ?? null,
        indicatorSource: o.indicatorSource ?? null,
        indicatorParams: (o.indicatorParams ?? null) as Record<string, number | string> | null,
        pinnedTo: o.pinnedTo ?? null,
      })),
    }
  }

  // Old panel format: { id, symbol, timeframe, mode } — convert to overlay model
  return {
    id: p.id,
    timeframe: p.timeframe || "1m",
    overlays: [{
      id: `o-${p.id.split("-")[1]}`,
      symbol: p.symbol ?? null,
      mode: p.mode || "price",
      chartType: "Candlestick",
      visible: true,
      colorScheme: 0,
      opacity: 1,
      indicatorType: null,
      indicatorParams: null,
      pinnedTo: null,
    }],
  }
}
