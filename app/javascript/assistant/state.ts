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
    // Strip legacy fields before merging so they don't survive into the normalized state
    const { lastDraftMessageId: _removed, ...rest } = stored as Partial<WorkspaceAssistantState> & { lastDraftMessageId?: unknown }
    Object.assign(state, rest)
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
