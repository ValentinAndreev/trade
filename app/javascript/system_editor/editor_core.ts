import type { ResearchDslDiagnostic } from "../research/dsl"
import type { SystemEditorConfig } from "../types/store"
import { showToast } from "../services/toast"

export type EditorSnapshot = {
  field: "yaml" | "search" | null
  selectionStart: number
  selectionEnd: number
  scrollTop: number
  scrollLeft: number
}

export class EditorCore {
  private snapshot: EditorSnapshot | null = null

  constructor(private element: HTMLElement) {}

  syncScroll(): void {
    const textarea = this.yamlTextarea()
    const gutter = this.element.querySelector<HTMLElement>("[data-system-editor-gutter]")
    if (!textarea || !gutter) return

    gutter.style.transform = `translateY(${-textarea.scrollTop}px)`
  }

  captureSnapshot(): void {
    const activeElement = document.activeElement
    const yaml = this.yamlTextarea()
    const search = this.searchInput()

    if (activeElement === yaml && yaml) {
      this.snapshot = {
        field: "yaml",
        selectionStart: yaml.selectionStart,
        selectionEnd: yaml.selectionEnd,
        scrollTop: yaml.scrollTop,
        scrollLeft: yaml.scrollLeft,
      }
      return
    }

    if (activeElement === search && search) {
      this.snapshot = {
        field: "search",
        selectionStart: search.selectionStart || 0,
        selectionEnd: search.selectionEnd || 0,
        scrollTop: 0,
        scrollLeft: 0,
      }
      return
    }

    this.snapshot = null
  }

  restoreSnapshot(): void {
    if (!this.snapshot) return

    const target = this.snapshot.field === "yaml" ? this.yamlTextarea() : this.searchInput()
    if (!target) return

    target.focus()
    target.setSelectionRange(this.snapshot.selectionStart, this.snapshot.selectionEnd)
    if ("scrollTop" in target) {
      target.scrollTop = this.snapshot.scrollTop
      target.scrollLeft = this.snapshot.scrollLeft
    }
  }

  findMatch(direction: 1 | -1, state: SystemEditorConfig | null): void {
    const textarea = this.yamlTextarea()
    const query = state?.searchQuery?.trim()
    if (!textarea || !query) {
      showToast("Enter text to search")
      return
    }

    const haystack = textarea.value.toLowerCase()
    const needle = query.toLowerCase()
    const pivot = direction > 0 ? textarea.selectionEnd : Math.max(0, textarea.selectionStart - 1)

    let index = direction > 0
      ? haystack.indexOf(needle, pivot)
      : haystack.lastIndexOf(needle, pivot)

    if (index === -1) {
      index = direction > 0 ? haystack.indexOf(needle) : haystack.lastIndexOf(needle)
    }

    if (index === -1) {
      showToast("No matches found")
      return
    }

    textarea.focus()
    textarea.setSelectionRange(index, index + query.length)
    textarea.scrollTop = this.scrollTopForIndex(textarea.value, index, textarea)
    this.syncScroll()
  }

  focusDiagnostic(diagnostic: Pick<ResearchDslDiagnostic, "line" | "column" | "length"> | null): void {
    const textarea = this.yamlTextarea()
    if (!textarea || !diagnostic) return

    const start = this.indexForLineColumn(textarea.value, diagnostic.line, diagnostic.column)
    const end = start + Math.max(1, diagnostic.length)
    textarea.focus()
    textarea.setSelectionRange(start, end)
    textarea.scrollTop = this.scrollTopForIndex(textarea.value, start, textarea)
    this.syncScroll()
  }

  scrollTopForIndex(text: string, index: number, textarea: HTMLTextAreaElement): number {
    const before = text.slice(0, index)
    const line = before.split("\n").length - 1
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight || "24")
    return Math.max(0, line * lineHeight - textarea.clientHeight / 3)
  }

  indexForLineColumn(text: string, line: number, column: number): number {
    const lines = text.split("\n")
    let index = 0
    for (let i = 0; i < Math.max(0, line - 1); i += 1) {
      index += (lines[i]?.length || 0) + 1
    }
    return index + Math.max(0, column - 1)
  }

  searchMatchCount(state: SystemEditorConfig | null): number {
    const text = state?.systemYaml || ""
    const query = state?.searchQuery?.trim().toLowerCase() || ""
    if (!query) return 0

    let count = 0
    let index = 0
    const haystack = text.toLowerCase()
    while (index < haystack.length) {
      const match = haystack.indexOf(query, index)
      if (match === -1) break
      count += 1
      index = match + Math.max(1, query.length)
    }
    return count
  }

  yamlTextarea(): HTMLTextAreaElement | null {
    return this.element.querySelector<HTMLTextAreaElement>("[data-field='systemYaml']")
  }

  searchInput(): HTMLInputElement | null {
    return this.element.querySelector<HTMLInputElement>("[data-field='searchQuery']")
  }
}
