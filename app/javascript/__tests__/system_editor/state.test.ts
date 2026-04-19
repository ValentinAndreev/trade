import { describe, it, expect } from "vitest"
import {
  buildDefaultSystemEditorState,
  hydrateSystemEditorState,
  normalizeSystemEditorState,
  buildStarterSystemYaml,
} from "../../system_editor/state"

// ---------------------------------------------------------------------------
// buildDefaultSystemEditorState
// ---------------------------------------------------------------------------

describe("buildDefaultSystemEditorState", () => {
  it("returns expected defaults", () => {
    const state = buildDefaultSystemEditorState()
    expect(state.systemId).toBe("custom_system")
    expect(state.sourceSystemId).toBeNull()
    expect(state.sourcePath).toBeNull()
    expect(state.directoryPath).toBeNull()
    expect(state.systemYaml).toBe("")
    expect(state.searchQuery).toBe("")
  })

  it("returns a fresh object each call", () => {
    expect(buildDefaultSystemEditorState()).not.toBe(buildDefaultSystemEditorState())
  })
})

// ---------------------------------------------------------------------------
// normalizeSystemEditorState
// ---------------------------------------------------------------------------

describe("normalizeSystemEditorState", () => {
  it("resets invalid systemId to default", () => {
    const state = buildDefaultSystemEditorState()
    ;(state as unknown as Record<string, unknown>).systemId = 42
    normalizeSystemEditorState(state)
    expect(state.systemId).toBe("custom_system")
  })

  it("keeps valid systemId string", () => {
    const state = buildDefaultSystemEditorState()
    state.systemId = "rsi_threshold"
    normalizeSystemEditorState(state)
    expect(state.systemId).toBe("rsi_threshold")
  })

  it("falls back to systemId when sourceSystemId is invalid", () => {
    const state = buildDefaultSystemEditorState()
    state.systemId = "rsi_system"
    ;(state as unknown as Record<string, unknown>).sourceSystemId = 123
    normalizeSystemEditorState(state)
    expect(state.sourceSystemId).toBe("rsi_system")
  })

  it("falls back to null when sourceSystemId invalid and systemId empty", () => {
    const state = buildDefaultSystemEditorState()
    ;(state as unknown as Record<string, unknown>).systemId = ""
    ;(state as unknown as Record<string, unknown>).sourceSystemId = 123
    normalizeSystemEditorState(state)
    expect(state.sourceSystemId).toBeNull()
  })

  it("keeps null sourceSystemId", () => {
    const state = buildDefaultSystemEditorState()
    state.sourceSystemId = null
    normalizeSystemEditorState(state)
    expect(state.sourceSystemId).toBeNull()
  })

  it("keeps valid sourceSystemId string", () => {
    const state = buildDefaultSystemEditorState()
    state.sourceSystemId = "base_system"
    normalizeSystemEditorState(state)
    expect(state.sourceSystemId).toBe("base_system")
  })

  it("resets invalid sourcePath to null", () => {
    const state = buildDefaultSystemEditorState()
    ;(state as unknown as Record<string, unknown>).sourcePath = 999
    normalizeSystemEditorState(state)
    expect(state.sourcePath).toBeNull()
  })

  it("resets invalid systemYaml to empty string", () => {
    const state = buildDefaultSystemEditorState()
    ;(state as unknown as Record<string, unknown>).systemYaml = null
    normalizeSystemEditorState(state)
    expect(state.systemYaml).toBe("")
  })

  it("resets invalid searchQuery to empty string", () => {
    const state = buildDefaultSystemEditorState()
    ;(state as unknown as Record<string, unknown>).searchQuery = undefined
    normalizeSystemEditorState(state)
    expect(state.searchQuery).toBe("")
  })
})

// ---------------------------------------------------------------------------
// hydrateSystemEditorState
// ---------------------------------------------------------------------------

describe("hydrateSystemEditorState", () => {
  it("returns defaults for null", () => {
    const state = hydrateSystemEditorState(null)
    expect(state.systemId).toBe("custom_system")
    expect(state.systemYaml).toBe("")
  })

  it("returns defaults for undefined", () => {
    const state = hydrateSystemEditorState(undefined)
    expect(state.systemId).toBe("custom_system")
  })

  it("merges valid stored values", () => {
    const state = hydrateSystemEditorState({
      systemId: "my_system",
      systemYaml: "id: my_system",
      searchQuery: "rsi",
    })
    expect(state.systemId).toBe("my_system")
    expect(state.systemYaml).toBe("id: my_system")
    expect(state.searchQuery).toBe("rsi")
  })

  it("normalizes invalid values from stored data", () => {
    const state = hydrateSystemEditorState({
      systemId: 99 as never,
      systemYaml: null as never,
    })
    expect(state.systemId).toBe("custom_system")
    expect(state.systemYaml).toBe("")
  })

  it("preserves sourcePath and directoryPath", () => {
    const state = hydrateSystemEditorState({
      sourcePath: "systems/my.yaml",
      directoryPath: "systems/",
    })
    expect(state.sourcePath).toBe("systems/my.yaml")
    expect(state.directoryPath).toBe("systems/")
  })
})

// ---------------------------------------------------------------------------
// buildStarterSystemYaml
// ---------------------------------------------------------------------------

describe("buildStarterSystemYaml", () => {
  it("uses default id when not provided", () => {
    const yaml = buildStarterSystemYaml()
    expect(yaml).toContain("id: custom_system")
    expect(yaml).toContain("name: Custom System")
  })

  it("uses provided id", () => {
    const yaml = buildStarterSystemYaml("rsi_threshold")
    expect(yaml).toContain("id: rsi_threshold")
  })

  it("converts snake_case id to Title Case name", () => {
    expect(buildStarterSystemYaml("rsi_threshold")).toContain("name: Rsi Threshold")
    expect(buildStarterSystemYaml("my_long_name")).toContain("name: My Long Name")
  })

  it("converts kebab-case id to Title Case name", () => {
    expect(buildStarterSystemYaml("ema-crossover")).toContain("name: Ema Crossover")
  })

  it("contains required YAML keys", () => {
    const yaml = buildStarterSystemYaml("test")
    expect(yaml).toContain("modules: {}")
    expect(yaml).toContain("params:")
    expect(yaml).toContain("conditions: {}")
    expect(yaml).toContain("optimization:")
    expect(yaml).toContain("position_mode: long_short")
    expect(yaml).toContain("targets: []")
  })

  it("each section is on its own line", () => {
    const lines = buildStarterSystemYaml("test").split("\n")
    expect(lines.some(l => l.startsWith("id:"))).toBe(true)
    expect(lines.some(l => l.startsWith("name:"))).toBe(true)
    expect(lines.some(l => l.startsWith("modules:"))).toBe(true)
  })
})
