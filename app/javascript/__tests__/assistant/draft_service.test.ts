import { describe, it, expect } from "vitest"
import {
  buildDraftFromYaml,
  draftFromMetadata,
  draftMatchesLinkedTarget,
} from "../../assistant/draft_service"
import type { AssistantDraftPayload } from "../../assistant/api"
import type { AssistantTarget, AssistantWorkspaceTabSummary } from "../../types/store"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraft(overrides: Partial<AssistantDraftPayload> = {}): AssistantDraftPayload {
  return {
    kind: "system_draft",
    yaml: "id: test\nname: Test",
    source_yaml_hash: null,
    validation: { ok: true, diagnostics: [], system: null },
    suggested_target: null,
    ...overrides,
  }
}

function makeTab(id: string, opts: Partial<AssistantWorkspaceTabSummary> = {}): AssistantWorkspaceTabSummary {
  return { id, type: "system_editor", label: "Editor", sourcePath: null, systemId: null, ...opts }
}

function makeTarget(tabId: string): Extract<AssistantTarget, { type: "system_editor" }> {
  return { type: "system_editor", tabId }
}

// ---------------------------------------------------------------------------
// buildDraftFromYaml
// ---------------------------------------------------------------------------

describe("buildDraftFromYaml", () => {
  it("wraps yaml in draft envelope", () => {
    const draft = buildDraftFromYaml("id: foo")
    expect(draft.kind).toBe("system_draft")
    expect(draft.yaml).toBe("id: foo")
  })

  it("sets no-validation defaults", () => {
    const draft = buildDraftFromYaml("id: foo")
    expect(draft.source_yaml_hash).toBeNull()
    expect(draft.suggested_target).toBeNull()
    expect(draft.validation.ok).toBe(false)
    expect(draft.validation.diagnostics).toEqual([])
    expect(draft.validation.system).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// draftFromMetadata
// ---------------------------------------------------------------------------

describe("draftFromMetadata", () => {
  it("returns null for null metadata", () => {
    expect(draftFromMetadata(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(draftFromMetadata(undefined)).toBeNull()
  })

  it("returns null when metadata has no draft key", () => {
    expect(draftFromMetadata({ foo: "bar" })).toBeNull()
  })

  it("returns null when draft is not an object", () => {
    expect(draftFromMetadata({ draft: "not-an-object" })).toBeNull()
  })

  it("returns null when draft.yaml is not a string", () => {
    expect(draftFromMetadata({ draft: { yaml: 42 } })).toBeNull()
  })

  it("returns draft payload when valid", () => {
    const payload = {
      kind: "system_draft",
      yaml: "id: my_system",
      source_yaml_hash: null,
      validation: { ok: true, diagnostics: [], system: null },
      suggested_target: null,
    }
    const result = draftFromMetadata({ draft: payload })
    expect(result).toBe(payload)
  })
})

// ---------------------------------------------------------------------------
// draftMatchesLinkedTarget
// ---------------------------------------------------------------------------

describe("draftMatchesLinkedTarget — no linked target", () => {
  it("returns true when linkedTarget is null (nothing to protect)", () => {
    const draft = makeDraft({ suggested_target: null })
    expect(draftMatchesLinkedTarget(draft, null, [])).toBe(true)
  })
})

describe("draftMatchesLinkedTarget — no suggested_target", () => {
  it("returns false when draft has no provenance", () => {
    const draft = makeDraft({ suggested_target: null })
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), [makeTab("tab-1")])).toBe(false)
  })
})

describe("draftMatchesLinkedTarget — tab not found", () => {
  it("returns false when linked tab is not in snapshot", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: "foo", source_path: null },
    })
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-missing"), [makeTab("tab-other")])).toBe(false)
  })
})

describe("draftMatchesLinkedTarget — system_id comparison", () => {
  it("returns false when both system_ids present and differ", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: "sys_a", source_path: null },
    })
    const tabs = [makeTab("tab-1", { systemId: "sys_b" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(false)
  })

  it("returns true when system_ids match", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: "sys_a", source_path: null },
    })
    const tabs = [makeTab("tab-1", { systemId: "sys_a" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(true)
  })

  it("returns true when draft system_id is null (no constraint)", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: null, source_path: null },
    })
    const tabs = [makeTab("tab-1", { systemId: "sys_b" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(true)
  })

  it("returns true when tab systemId is null (new/unsaved system)", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: "sys_a", source_path: null },
    })
    const tabs = [makeTab("tab-1", { systemId: null })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(true)
  })
})

describe("draftMatchesLinkedTarget — source_path comparison", () => {
  it("returns false when both source_paths present and differ", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: null, source_path: "systems/a.yaml" },
    })
    const tabs = [makeTab("tab-1", { sourcePath: "systems/b.yaml" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(false)
  })

  it("returns true when source_paths match", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: null, source_path: "systems/a.yaml" },
    })
    const tabs = [makeTab("tab-1", { sourcePath: "systems/a.yaml" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(true)
  })

  it("returns true when draft source_path is null", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: null, source_path: null },
    })
    const tabs = [makeTab("tab-1", { sourcePath: "systems/a.yaml" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(true)
  })
})

describe("draftMatchesLinkedTarget — matches when all identifiers align", () => {
  it("returns true when system_id and source_path both match", () => {
    const draft = makeDraft({
      suggested_target: { type: "system_editor", system_id: "sys_a", source_path: "systems/a.yaml" },
    })
    const tabs = [makeTab("tab-1", { systemId: "sys_a", sourcePath: "systems/a.yaml" })]
    expect(draftMatchesLinkedTarget(draft, makeTarget("tab-1"), tabs)).toBe(true)
  })
})
