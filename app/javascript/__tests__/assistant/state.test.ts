import { describe, it, expect } from "vitest"
import {
  buildDefaultWorkspaceAssistantState,
  hydrateWorkspaceAssistantState,
  normalizeWorkspaceAssistantState,
  normalizeAssistantTarget,
} from "../../assistant/state"

// ---------------------------------------------------------------------------
// buildDefaultWorkspaceAssistantState
// ---------------------------------------------------------------------------

describe("buildDefaultWorkspaceAssistantState", () => {
  it("returns zeroed state", () => {
    const state = buildDefaultWorkspaceAssistantState()
    expect(state.currentChatId).toBeNull()
    expect(state.provider).toBeNull()
    expect(state.linkedTarget).toBeNull()
  })

  it("returns a fresh object each call", () => {
    const a = buildDefaultWorkspaceAssistantState()
    const b = buildDefaultWorkspaceAssistantState()
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// normalizeAssistantTarget
// ---------------------------------------------------------------------------

describe("normalizeAssistantTarget", () => {
  it("returns null for null input", () => {
    expect(normalizeAssistantTarget(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(normalizeAssistantTarget(undefined)).toBeNull()
  })

  it("returns null for non-object", () => {
    expect(normalizeAssistantTarget("string" as never)).toBeNull()
  })

  it("returns null when type is not system_editor", () => {
    expect(normalizeAssistantTarget({ type: "chart", tabId: "tab-1" })).toBeNull()
  })

  it("returns null when tabId is missing", () => {
    expect(normalizeAssistantTarget({ type: "system_editor" })).toBeNull()
  })

  it("returns null when tabId is not a string", () => {
    expect(normalizeAssistantTarget({ type: "system_editor", tabId: 42 })).toBeNull()
  })

  it("returns normalized target for valid input", () => {
    const result = normalizeAssistantTarget({ type: "system_editor", tabId: "tab-abc" })
    expect(result).toEqual({ type: "system_editor", tabId: "tab-abc" })
  })

  it("strips extra fields from target", () => {
    const result = normalizeAssistantTarget({ type: "system_editor", tabId: "tab-1", extra: "noise" })
    expect(result).toEqual({ type: "system_editor", tabId: "tab-1" })
    expect(result).not.toHaveProperty("extra")
  })
})

// ---------------------------------------------------------------------------
// normalizeWorkspaceAssistantState
// ---------------------------------------------------------------------------

describe("normalizeWorkspaceAssistantState", () => {
  it("resets invalid currentChatId to null", () => {
    const state = buildDefaultWorkspaceAssistantState()
    ;(state as unknown as Record<string, unknown>).currentChatId = "not-a-number"
    normalizeWorkspaceAssistantState(state)
    expect(state.currentChatId).toBeNull()
  })

  it("keeps numeric currentChatId", () => {
    const state = buildDefaultWorkspaceAssistantState()
    state.currentChatId = 42
    normalizeWorkspaceAssistantState(state)
    expect(state.currentChatId).toBe(42)
  })

  it("resets invalid provider to null", () => {
    const state = buildDefaultWorkspaceAssistantState()
    ;(state as unknown as Record<string, unknown>).provider = 123
    normalizeWorkspaceAssistantState(state)
    expect(state.provider).toBeNull()
  })

  it("keeps string provider", () => {
    const state = buildDefaultWorkspaceAssistantState()
    state.provider = "anthropic"
    normalizeWorkspaceAssistantState(state)
    expect(state.provider).toBe("anthropic")
  })

  it("normalizes invalid linkedTarget to null", () => {
    const state = buildDefaultWorkspaceAssistantState()
    ;(state as unknown as Record<string, unknown>).linkedTarget = { type: "unknown", tabId: "t1" }
    normalizeWorkspaceAssistantState(state)
    expect(state.linkedTarget).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// hydrateWorkspaceAssistantState
// ---------------------------------------------------------------------------

describe("hydrateWorkspaceAssistantState", () => {
  it("returns default state for null", () => {
    const state = hydrateWorkspaceAssistantState(null)
    expect(state.currentChatId).toBeNull()
    expect(state.provider).toBeNull()
    expect(state.linkedTarget).toBeNull()
  })

  it("returns default state for undefined", () => {
    const state = hydrateWorkspaceAssistantState(undefined)
    expect(state.currentChatId).toBeNull()
  })

  it("merges valid stored values", () => {
    const state = hydrateWorkspaceAssistantState({ currentChatId: 7, provider: "openai" })
    expect(state.currentChatId).toBe(7)
    expect(state.provider).toBe("openai")
  })

  it("strips legacy lastDraftMessageId field", () => {
    const stored = { currentChatId: 1, lastDraftMessageId: 99 } as Record<string, unknown>
    const state = hydrateWorkspaceAssistantState(stored as never)
    expect(state).not.toHaveProperty("lastDraftMessageId")
  })

  it("normalizes invalid currentChatId from stored", () => {
    const state = hydrateWorkspaceAssistantState({ currentChatId: "bad" as never })
    expect(state.currentChatId).toBeNull()
  })

  it("hydrates valid linkedTarget", () => {
    const state = hydrateWorkspaceAssistantState({
      linkedTarget: { type: "system_editor", tabId: "tab-xyz" },
    })
    expect(state.linkedTarget).toEqual({ type: "system_editor", tabId: "tab-xyz" })
  })

  it("normalizes invalid linkedTarget", () => {
    const state = hydrateWorkspaceAssistantState({
      linkedTarget: { type: "chart", tabId: "t1" } as never,
    })
    expect(state.linkedTarget).toBeNull()
  })
})
