import type { AssistantDraftPayload } from "./api"
import type { AssistantTarget, AssistantWorkspaceTabSummary } from "../types/store"

export function buildDraftFromYaml(yaml: string): AssistantDraftPayload {
  return {
    kind: "system_draft",
    yaml,
    source_yaml_hash: null,
    validation: { ok: false, diagnostics: [], system: null },
    suggested_target: null,
  }
}

export function draftFromMetadata(metadata: Record<string, unknown> | null | undefined): AssistantDraftPayload | null {
  const payload = metadata?.draft
  if (!payload || typeof payload !== "object") return null
  if (typeof (payload as Record<string, unknown>).yaml !== "string") return null
  return payload as AssistantDraftPayload
}

// Returns false when the draft should NOT be silently applied to the linked editor.
// Two failure modes:
//   1. No suggested_target — draft was created in unlinked mode, no provenance.
//   2. suggested_target unambiguously identifies a different system.
// Both sides must have a value for a mismatch to be conclusive.
export function draftMatchesLinkedTarget(
  draft: AssistantDraftPayload,
  linkedTarget: AssistantTarget | null,
  tabs: AssistantWorkspaceTabSummary[],
): boolean {
  if (!linkedTarget) return true           // no linked editor — nothing to protect
  const suggestedTarget = draft.suggested_target
  if (!suggestedTarget) return false       // no provenance — require confirmation

  const linkedTab = tabs.find(tab => tab.id === linkedTarget.tabId)
  if (!linkedTab) return false             // tab no longer in snapshot — stale state

  if (suggestedTarget.system_id && linkedTab.systemId
      && suggestedTarget.system_id !== linkedTab.systemId) return false

  if (suggestedTarget.source_path && linkedTab.sourcePath
      && suggestedTarget.source_path !== linkedTab.sourcePath) return false

  return true
}
