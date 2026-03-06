import { describe, it, expect, vi } from "vitest"
import { escapeHTML, createInlineRenameInput } from "../../utils/dom"

describe("escapeHTML", () => {
  it("escapes ampersand", () => {
    expect(escapeHTML("a&b")).toBe("a&amp;b")
  })

  it("escapes angle brackets", () => {
    expect(escapeHTML("<script>")).toBe("&lt;script&gt;")
  })

  it("escapes quotes", () => {
    expect(escapeHTML(`"hello"`)).toBe("&quot;hello&quot;")
    expect(escapeHTML("it's")).toBe("it&#39;s")
  })

  it("escapes combined special chars", () => {
    expect(escapeHTML(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;")
  })

  it("converts non-string input to string", () => {
    expect(escapeHTML(42)).toBe("42")
    expect(escapeHTML(null)).toBe("null")
    expect(escapeHTML(undefined)).toBe("undefined")
  })
})

describe("createInlineRenameInput", () => {
  it("creates an input with the given value", () => {
    const input = createInlineRenameInput("hello", vi.fn())
    expect(input.tagName).toBe("INPUT")
    expect(input.type).toBe("text")
    expect(input.value).toBe("hello")
  })

  it("calls onCommit with trimmed text on blur", () => {
    const onCommit = vi.fn()
    const input = createInlineRenameInput("old", onCommit)
    input.value = "  new text  "
    input.dispatchEvent(new Event("blur"))
    expect(onCommit).toHaveBeenCalledWith("new text")
  })

  it("triggers blur on Enter key", () => {
    const onCommit = vi.fn()
    const input = createInlineRenameInput("old", onCommit)
    input.value = "updated"

    const blurSpy = vi.spyOn(input, "blur")
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
    expect(blurSpy).toHaveBeenCalled()
  })

  it("resets value and blurs on Escape key", () => {
    const onCommit = vi.fn()
    const input = createInlineRenameInput("original", onCommit)
    input.value = "changed"

    const blurSpy = vi.spyOn(input, "blur")
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(input.value).toBe("original")
    expect(blurSpy).toHaveBeenCalled()
  })

  it("applies custom CSS class", () => {
    const input = createInlineRenameInput("x", vi.fn(), "my-class")
    expect(input.className).toBe("my-class")
  })
})
