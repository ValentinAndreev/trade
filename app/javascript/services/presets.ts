import { loadTabs, saveTabs, loadActiveTabId, saveActiveTabId } from "../tabs/persistence"
import { jsonHeaders } from "../utils/api_helpers"
import type { PresetInfo } from "../types/markets"
import type { Tab } from "../types/store"

const ACTIVE_PRESET_KEY = "active-preset"
const NAV_PAGE_KEY = "nav-active-page"

/** Increment when the preset schema changes. */
export const PRESET_VERSION = 2

export interface PresetPayload {
  version: number
  tabs: Tab[]
  activeTabId: string | null
  navPage: string
  dashboardSymbols?: unknown
  marketsSymbols?: unknown
}

// ---------------------------------------------------------------------------
// Active preset helpers
// ---------------------------------------------------------------------------

export function getActivePreset(): PresetInfo | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PRESET_KEY)
    return raw ? (JSON.parse(raw) as PresetInfo) : null
  } catch { return null }
}

export function setActivePreset(preset: PresetInfo | null): void {
  if (preset) {
    localStorage.setItem(ACTIVE_PRESET_KEY, JSON.stringify({ id: preset.id, name: preset.name }))
  } else {
    localStorage.removeItem(ACTIVE_PRESET_KEY)
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listPresets(): Promise<unknown[]> {
  const resp = await fetch("/api/presets", { headers: jsonHeaders() })
  if (!resp.ok) return []
  return resp.json()
}

export async function loadPreset(id: number): Promise<unknown> {
  const resp = await fetch(`/api/presets/${id}`, { headers: jsonHeaders() })
  if (!resp.ok) throw new Error("Failed to load preset")
  return resp.json()
}

export async function savePreset(id: number | null, name: string, payload: unknown, isDefault = false): Promise<unknown> {
  const method = id ? "PATCH" : "POST"
  const url = id ? `/api/presets/${id}` : "/api/presets"
  const resp = await fetch(url, {
    method,
    headers: jsonHeaders(),
    body: JSON.stringify({ name, payload, is_default: isDefault }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.errors?.join(", ") || "Save failed")
  return data
}

export async function deletePreset(id: number): Promise<void> {
  await fetch(`/api/presets/${id}`, { method: "DELETE", headers: jsonHeaders() })
  const active = getActivePreset()
  if (active && active.id === id) setActivePreset(null)
}

// ---------------------------------------------------------------------------
// State collection & restoration
// ---------------------------------------------------------------------------

export async function collectState(): Promise<PresetPayload> {
  const tabs = loadTabs()
  const activeTabId = loadActiveTabId()
  const navPage = localStorage.getItem(NAV_PAGE_KEY) || "main"

  let dashboardSymbols = null
  let marketsSymbols = null
  try {
    const resp = await fetch("/api/presets/state", { headers: jsonHeaders() })
    if (resp.ok) {
      const serverState = await resp.json()
      dashboardSymbols = serverState.dashboardSymbols
      marketsSymbols = serverState.marketsSymbols
    }
  } catch { /* offline */ }

  return { version: PRESET_VERSION, tabs, activeTabId, navPage, dashboardSymbols, marketsSymbols }
}

export async function applyState(payload: Partial<PresetPayload> | null): Promise<void> {
  if (!payload) return

  if (payload.tabs) saveTabs(payload.tabs)
  if (payload.activeTabId) saveActiveTabId(payload.activeTabId)
  if (payload.navPage) localStorage.setItem(NAV_PAGE_KEY, payload.navPage)

  if (payload.dashboardSymbols || payload.marketsSymbols) {
    try {
      await fetch("/api/presets/apply_state", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          dashboardSymbols: payload.dashboardSymbols,
          marketsSymbols: payload.marketsSymbols,
        }),
      })
    } catch { /* ignore */ }
  }

  window.location.reload()
}

export async function resetState(): Promise<void> {
  localStorage.removeItem("chart-tabs")
  localStorage.removeItem("chart-active-tab")
  localStorage.removeItem(NAV_PAGE_KEY)
  setActivePreset(null)

  try {
    await fetch("/api/presets/reset_state", { method: "POST", headers: jsonHeaders() })
  } catch { /* offline */ }
}
