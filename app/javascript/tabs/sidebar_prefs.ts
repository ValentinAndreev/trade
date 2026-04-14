export type SidebarPrefs = {
  widthPx: number
  collapsed: boolean
}

export type SidebarScope = "chart" | "data" | "research"
export type SidebarPrefsRecord = Record<SidebarScope, SidebarPrefs>

const STORAGE_KEY = "chart-sidebar-prefs"
export const DEFAULT_SIDEBAR_WIDTH_PX = 352
export const MIN_SIDEBAR_WIDTH_PX = 320
export const MAX_SIDEBAR_WIDTH_PX = 720
const SIDEBAR_SCOPES: SidebarScope[] = ["chart", "data", "research"]
let cachedSidebarPrefsRecord: SidebarPrefsRecord | null = null
let cachedSidebarPrefsRaw: string | null | undefined = undefined

/** Reset the in-memory cache. Call in test `beforeEach` to prevent cross-test pollution. */
export function resetSidebarPrefsCache(): void {
  cachedSidebarPrefsRecord = null
  cachedSidebarPrefsRaw = undefined
}

export function loadSidebarPrefs(scope: SidebarScope = "chart"): SidebarPrefs {
  return cloneSidebarPrefs(_ensureCachedRecord()[scope])
}

export function loadSidebarPrefsRecord(): SidebarPrefsRecord {
  return cloneSidebarPrefsRecord(_ensureCachedRecord())
}

function _ensureCachedRecord(): SidebarPrefsRecord {
  try {
    const stored = readSidebarPrefsRaw()
    if (!cachedSidebarPrefsRecord || stored !== cachedSidebarPrefsRaw) {
      cachedSidebarPrefsRaw = stored
      cachedSidebarPrefsRecord = normalizeSidebarPrefsRecord(stored ? JSON.parse(stored) as unknown : null)
    }
  } catch {
    cachedSidebarPrefsRaw = null
    cachedSidebarPrefsRecord = defaultSidebarPrefsRecord()
  }
  return cachedSidebarPrefsRecord
}

export function saveSidebarPrefs(scope: SidebarScope, prefs: SidebarPrefs): SidebarPrefsRecord {
  return saveSidebarPrefsRecord({ ..._ensureCachedRecord(), [scope]: prefs })
}

export function saveSidebarPrefsRecord(record: Partial<Record<SidebarScope, SidebarPrefs>>): SidebarPrefsRecord {
  const normalized = normalizeSidebarPrefsRecord(record)
  cachedSidebarPrefsRecord = normalized
  cachedSidebarPrefsRaw = JSON.stringify(normalized)
  localStorage.setItem(STORAGE_KEY, cachedSidebarPrefsRaw)
  return cloneSidebarPrefsRecord(normalized)
}

export function clampSidebarWidth(widthPx: number, maxViewportPx?: number): number {
  const viewportLimit = Number.isFinite(maxViewportPx) ? Math.floor((maxViewportPx as number) * 0.45) : MAX_SIDEBAR_WIDTH_PX
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH_PX, Math.min(MAX_SIDEBAR_WIDTH_PX, viewportLimit))
  if (!Number.isFinite(widthPx)) return Math.min(DEFAULT_SIDEBAR_WIDTH_PX, maxWidth)
  return Math.max(MIN_SIDEBAR_WIDTH_PX, Math.min(maxWidth, Math.round(widthPx)))
}

function defaultSidebarPrefs(): SidebarPrefs {
  return {
    widthPx: DEFAULT_SIDEBAR_WIDTH_PX,
    collapsed: false,
  }
}

function defaultSidebarPrefsRecord(): SidebarPrefsRecord {
  return {
    chart: defaultSidebarPrefs(),
    data: defaultSidebarPrefs(),
    research: defaultSidebarPrefs(),
  }
}

function cloneSidebarPrefs(prefs: SidebarPrefs): SidebarPrefs {
  return { ...prefs }
}

function cloneSidebarPrefsRecord(record: SidebarPrefsRecord): SidebarPrefsRecord {
  return {
    chart: cloneSidebarPrefs(record.chart),
    data: cloneSidebarPrefs(record.data),
    research: cloneSidebarPrefs(record.research),
  }
}

function normalizeSidebarPrefs(input: Partial<SidebarPrefs>): SidebarPrefs {
  return {
    widthPx: clampSidebarWidth(input.widthPx ?? DEFAULT_SIDEBAR_WIDTH_PX, window.innerWidth || MAX_SIDEBAR_WIDTH_PX),
    collapsed: input.collapsed === true,
  }
}

function readSidebarPrefsRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function normalizeSidebarPrefsRecord(input: unknown): SidebarPrefsRecord {
  const defaults = defaultSidebarPrefsRecord()
  if (!input || typeof input !== "object") return defaults

  const legacyPrefs = input as Partial<SidebarPrefs>
  if ("widthPx" in legacyPrefs || "collapsed" in legacyPrefs) {
    const normalized = normalizeSidebarPrefs(legacyPrefs)
    return {
      chart: normalized,
      data: normalized,
      research: normalized,
    }
  }

  const record = input as Partial<Record<SidebarScope, Partial<SidebarPrefs>>>
  return SIDEBAR_SCOPES.reduce<SidebarPrefsRecord>((result, scope) => {
    result[scope] = normalizeSidebarPrefs(record[scope] || defaults[scope])
    return result
  }, { ...defaults })
}

export function sidebarScopeForTabType(tabType: string | null | undefined): SidebarScope {
  if (tabType === "data") return "data"
  if (tabType === "research") return "research"
  return "chart"
}
