import { describe, it, expect, vi } from "vitest"
import { escapeHTML, createInlineRenameInput, dispatchWorkspaceEvent } from "../../utils/dom"

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

describe("dispatchWorkspaceEvent", () => {
  it("dispatches value and mouse detail from the current target", () => {
    const host = document.createElement("section")
    const input = document.createElement("input")
    const handler = vi.fn()

    input.value = "btc"
    input.dataset.workspaceEvent = "workspace:test"
    input.addEventListener("click", event => dispatchWorkspaceEvent(host, event, true))
    host.addEventListener("workspace:test", handler)
    host.appendChild(input)

    input.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ value: "btc", mouseDetail: 2 })
  })

  it("dispatches path and kind details without bubbling by default", () => {
    const outer = document.createElement("div")
    const host = document.createElement("section")
    const button = document.createElement("button")
    const hostHandler = vi.fn()
    const outerHandler = vi.fn()

    button.dataset.workspaceEvent = "workspace:navigate"
    button.dataset.path = "systems/example.yml"
    button.dataset.kind = "file"
    button.addEventListener("click", event => dispatchWorkspaceEvent(host, event))
    host.addEventListener("workspace:navigate", hostHandler)
    outer.addEventListener("workspace:navigate", outerHandler)
    host.appendChild(button)
    outer.appendChild(host)

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(hostHandler).toHaveBeenCalledTimes(1)
    expect(hostHandler.mock.calls[0][0].detail).toEqual({
      mouseDetail: 0,
      path: "systems/example.yml",
      kind: "file",
    })
    expect(outerHandler).not.toHaveBeenCalled()
  })

  it("does not dispatch when the target has no workspace event name", () => {
    const host = document.createElement("section")
    const button = document.createElement("button")
    const handler = vi.fn()

    button.addEventListener("click", event => dispatchWorkspaceEvent(host, event, true))
    host.addEventListener("workspace:test", handler)
    host.appendChild(button)

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(handler).not.toHaveBeenCalled()
  })
})
