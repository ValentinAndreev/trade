import { loadTabs, saveTabs, loadActiveTabId, saveActiveTabId } from "../tabs/persistence"

const ACTIVE_PRESET_KEY = "active-preset"

function csrf() {
  return document.querySelector("meta[name='csrf-token']")?.content || ""
}

function headers() {
  return { "Content-Type": "application/json", "X-CSRF-Token": csrf() }
}

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
  const resp = await fetch("/api/presets", { headers: headers() })
  if (!resp.ok) return []
  return resp.json()
}

export async function loadPreset(id) {
  const resp = await fetch(`/api/presets/${id}`, { headers: headers() })
  if (!resp.ok) throw new Error("Failed to load preset")
  return resp.json()
}

export async function savePreset(id, name, payload, isDefault = false) {
  const method = id ? "PATCH" : "POST"
  const url = id ? `/api/presets/${id}` : "/api/presets"
  const resp = await fetch(url, {
    method,
    headers: headers(),
    body: JSON.stringify({ name, payload, is_default: isDefault }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.errors?.join(", ") || "Save failed")
  return data
}

export async function deletePreset(id) {
  await fetch(`/api/presets/${id}`, { method: "DELETE", headers: headers() })
  const active = getActivePreset()
  if (active && active.id === id) setActivePreset(null)
}

export async function resetState() {
  localStorage.removeItem("chart-tabs")
  localStorage.removeItem("chart-active-tab")
  localStorage.removeItem("nav-active-page")
  setActivePreset(null)

  try {
    await fetch("/api/presets/reset_state", { method: "POST", headers: headers() })
  } catch { /* offline */ }
}

export async function collectState() {
  const tabs = loadTabs()
  const activeTabId = loadActiveTabId()
  const navPage = localStorage.getItem("nav-active-page") || "main"

  let dashboardSymbols = null
  let marketsSymbols = null
  try {
    const resp = await fetch("/api/presets/state", { headers: headers() })
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
  if (payload.navPage) localStorage.setItem("nav-active-page", payload.navPage)

  if (payload.dashboardSymbols || payload.marketsSymbols) {
    try {
      await fetch("/api/presets/apply_state", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          dashboardSymbols: payload.dashboardSymbols,
          marketsSymbols: payload.marketsSymbols,
        }),
      })
    } catch { /* ignore */ }
  }

  window.location.reload()
}
