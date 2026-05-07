import { describe, it, expect } from "vitest"

import { modelKeyAutocompleteContext } from "../../system_editor/autocomplete"

function textarea(value: string): HTMLTextAreaElement {
  const element = document.createElement("textarea")
  element.value = value
  element.selectionStart = value.length
  return element
}

describe("system editor autocomplete", () => {
  it("uses remote ML model autocomplete only in model_key values", () => {
    expect(modelKeyAutocompleteContext(textarea("  model_key: btc"))).toBe(true)
    expect(modelKeyAutocompleteContext(textarea("  model: btc"))).toBe(false)
    expect(modelKeyAutocompleteContext(textarea("  type: ml_signal"))).toBe(false)
  })
})
