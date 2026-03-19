import { describe, expect, it } from "vitest"
import { highlightYaml } from "../../system_editor/yaml_highlighter"

describe("yaml highlighter", () => {
  it("preserves a trailing blank line in the overlay", () => {
    expect(highlightYaml("alpha: 1\n")).toMatch(/\n\u200b$/)
  })

  it("highlights dotted sequence values consistently", () => {
    const html = highlightYaml([
      "optimization:",
      "  targets:",
      "    - rsi.period",
      "    - params.lower_threshold",
    ].join("\n"))

    expect(html).toContain(`<span style="color:#61afef">rsi.period</span>`)
    expect(html).toContain(`<span style="color:#61afef">params.lower_threshold</span>`)
  })
})
