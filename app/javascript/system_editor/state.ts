import { DEFAULT_CUSTOM_SYSTEM_ID } from "../config/constants"
import type { SystemEditorConfig } from "../types/store"

export function buildDefaultSystemEditorState(): SystemEditorConfig {
  return {
    systemId: DEFAULT_CUSTOM_SYSTEM_ID,
    sourceSystemId: null,
    sourcePath: null,
    directoryPath: null,
    systemYaml: "",
    searchQuery: "",
  }
}

export function hydrateSystemEditorState(stored: Partial<SystemEditorConfig> | null | undefined): SystemEditorConfig {
  const state = buildDefaultSystemEditorState()
  if (stored) Object.assign(state, stored)
  normalizeSystemEditorState(state)
  return state
}

export function normalizeSystemEditorState(state: SystemEditorConfig): void {
  if (typeof state.systemId !== "string") state.systemId = DEFAULT_CUSTOM_SYSTEM_ID
  if (typeof state.sourceSystemId !== "string" && state.sourceSystemId !== null) state.sourceSystemId = state.systemId || null
  if (typeof state.sourcePath !== "string" && state.sourcePath !== null) state.sourcePath = null
  if (typeof state.directoryPath !== "string" && state.directoryPath !== null) state.directoryPath = null
  if (typeof state.systemYaml !== "string") state.systemYaml = ""
  if (typeof state.searchQuery !== "string") state.searchQuery = ""
}

export function buildStarterSystemYaml(systemId = DEFAULT_CUSTOM_SYSTEM_ID): string {
  const name = systemId
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => part[0] ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(" ") || "Custom system"

  return [
    `id: ${systemId}`,
    `name: ${name}`,
    "modules: {}",
    "params:",
    "  position_mode: long_short",
    "conditions: {}",
    "optimization:",
    "  targets: []",
  ].join("\n")
}
