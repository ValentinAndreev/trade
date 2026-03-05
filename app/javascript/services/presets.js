import { loadTabs, saveTabs, loadActiveTabId, saveActiveTabId } from "../tabs/persistence"
import { jsonHeaders } from "../utils/api_helpers"

const ACTIVE_PRESET_KEY = "active-preset"

export function getActivePreset() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_PRESET_KEY))
  } catch { return null }
}

export function setActivePreset(preset) {
  if (preset) {
    localStorage.setItem(ACTIVE_PRESET_KEY, JSON.stringify({ id: preset.id, name: preset.name }))
  } else {
    localStorage.removeItem(ACTIVE_PRESET_KEY)
  }
}

export async function listPresets() {
  const resp = await fetch("/api/presets", { headers: jsonHeaders() })
  if (!resp.ok) return []
  return resp.json()
}

export async function loadPreset(id) {
  const resp = await fetch(`/api/presets/${id}`, { headers: jsonHeaders() })
  if (!resp.ok) throw new Error("Failed to load preset")
  return resp.json()
}

export async function savePreset(id, name, payload, isDefault = false) {
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

export async function deletePreset(id) {
  await fetch(`/api/presets/${id}`, { method: "DELETE", headers: jsonHeaders() })
  const active = getActivePreset()
  if (active && active.id === id) setActivePreset(null)
}

export async function resetState() {
  localStorage.removeItem("chart-tabs")
  localStorage.removeItem("chart-active-tab")
  localStorage.removeItem("nav-active-page")
  setActivePreset(null)

  try {
    await fetch("/api/presets/reset_state", { method: "POST", headers: jsonHeaders() })
  } catch { /* offline */ }
}

export async function collectState() {
  const tabs = loadTabs()
  const activeTabId = loadActiveTabId()
  const navPage = localStorage.getItem("nav-active-page") || "main"

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

  return { tabs, activeTabId, navPage, dashboardSymbols, marketsSymbols }
}

export async function applyState(payload) {
  if (!payload) return

  if (payload.tabs) saveTabs(payload.tabs)
  if (payload.activeTabId) saveActiveTabId(payload.activeTabId)

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
