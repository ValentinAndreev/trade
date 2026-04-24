import type { AssistantTarget, WorkspaceAssistantState } from "../types/store"

export function buildDefaultWorkspaceAssistantState(): WorkspaceAssistantState {
  return {
    currentChatId: null,
    provider: null,
    linkedTarget: null,
  }
}

export function hydrateWorkspaceAssistantState(
  stored: Partial<WorkspaceAssistantState> | null | undefined,
): WorkspaceAssistantState {
  const state = buildDefaultWorkspaceAssistantState()
  if (stored) {
    state.currentChatId = stored.currentChatId ?? null
    state.provider = stored.provider ?? null
    state.linkedTarget = stored.linkedTarget ?? null
  }
  normalizeWorkspaceAssistantState(state)
  return state
}

export function normalizeWorkspaceAssistantState(state: WorkspaceAssistantState): void {
  if (typeof state.currentChatId !== "number" && state.currentChatId !== null) state.currentChatId = null
  if (typeof state.provider !== "string" && state.provider !== null) state.provider = null
  state.linkedTarget = normalizeAssistantTarget(state.linkedTarget)
}

export function normalizeAssistantTarget(target: AssistantTarget | Record<string, unknown> | null | undefined): AssistantTarget {
  if (!target || typeof target !== "object") return null
  if (target.type !== "system_editor") return null

  const tabId = typeof target.tabId === "string" ? target.tabId : null
  if (!tabId) return null

  return {
    type: "system_editor",
    tabId,
  }
}
