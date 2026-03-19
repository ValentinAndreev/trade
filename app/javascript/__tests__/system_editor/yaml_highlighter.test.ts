import { describe, expect, it } from "vitest"
import { highlightYaml } from "../../system_editor/yaml_highlighter"

describe("yaml highlighter", () => {
  it("preserves a trailing blank line in the overlay", () => {
    expect(highlightYaml("alpha: 1\n")).toMatch(/\n\u200b$/)
  })
})
