import { normalizeColorScheme, normalizeOpacity } from "../utils/color"

const STORAGE_KEY = "chart-tabs"
const ACTIVE_TAB_KEY = "chart-active-tab"
const DEFAULT_TABS = []

export function loadTabs() {
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

export function saveTabs(tabs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
}

export function loadActiveTabId() {
  return localStorage.getItem(ACTIVE_TAB_KEY)
}

export function saveActiveTabId(tabId) {
  localStorage.setItem(ACTIVE_TAB_KEY, tabId)
}

export function calcNextId(tabs, prefix) {
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

function _migrateTab(t) {
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
        }],
      }],
    }
  }

  // Migrate panels
  return {
    ...t,
    name: t.name ?? null,
    panels: t.panels.map(p => _migratePanel(p)),
  }
}

function _migratePanel(p) {
  // Already has overlays — just ensure defaults
  if (p.overlays) {
    return {
      ...p,
      timeframe: p.timeframe || "1m",
      overlays: p.overlays.map((o, idx) => ({
        ...o,
        mode: o.mode || "price",
        chartType: o.chartType || "Candlestick",
        visible: o.visible !== false,
        colorScheme: normalizeColorScheme(o.colorScheme ?? idx),
        opacity: normalizeOpacity(o.opacity),
        indicatorType: o.indicatorType ?? null,
        indicatorSource: o.indicatorSource ?? null,
        indicatorParams: o.indicatorParams ?? null,
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
    }],
  }
}
