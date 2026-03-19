import { BG_SURFACE, BG_HOVER, BORDER_COLOR } from "../config/theme"
import type { HighlightConfig } from "./yaml_highlighter"

// Matches the current word being typed (letters, digits, underscores, dots)
const WORD_RE = /[a-z_][a-z0-9_.]*$/i

// Height of one text line — must match the textarea's leading-6 (24px)
const LINE_HEIGHT = 24

export class YamlAutocomplete {
  private dropdown: HTMLDivElement
  private textarea: HTMLTextAreaElement | null = null
  private config: HighlightConfig = { keywords: new Set(), values: new Set() }
  private matches: string[] = []
  private selectedIndex = 0

  private readonly onKeydown      = (e: KeyboardEvent) => this.handleKeydown(e)
  private readonly onDocMousedown = (e: MouseEvent) => {
    // Hide when clicking anywhere except the dropdown itself or its textarea
    if (
      !this.dropdown.contains(e.target as Node) &&
      e.target !== this.textarea
    ) {
      this.hide()
    }
  }

  constructor() {
    this.dropdown = document.createElement("div")
    this.dropdown.setAttribute("role", "listbox")
    this.dropdown.style.cssText = [
      "position: fixed",
      "z-index: 9999",
      `background: ${BG_SURFACE}`,
      `border: 1px solid ${BORDER_COLOR}`,
      "border-radius: 6px",
      "box-shadow: 0 8px 24px rgba(0,0,0,0.5)",
      "font-family: ui-monospace, monospace",
      "font-size: 13px",
      "line-height: 1.5",
      "max-height: 220px",
      "overflow-y: auto",
      "min-width: 160px",
      "display: none",
    ].join("; ")
    document.body.appendChild(this.dropdown)
    document.addEventListener("mousedown", this.onDocMousedown)
  }

  get isVisible(): boolean {
    return this.dropdown.style.display !== "none"
  }

  setConfig(config: HighlightConfig): void {
    this.config = config
  }

  // Re-attach to the textarea that was just created by a full re-render.
  // NOTE: no blur listener — hiding on blur caused the dropdown to vanish
  // immediately because _render() removes the focused textarea from the DOM
  // (which fires blur) before the new one is inserted.
  sync(textarea: HTMLTextAreaElement | null): void {
    if (this.textarea) {
      this.textarea.removeEventListener("keydown", this.onKeydown)
    }
    this.textarea = textarea
    if (textarea) {
      textarea.addEventListener("keydown", this.onKeydown)
    }
  }

  // Called by the controller's updateYaml() to refresh autocomplete matches.
  handleInput(textarea: HTMLTextAreaElement): void {
    const word = currentWord(textarea)
    if (!word) { this.hide(); return }

    const candidates = matchCandidates(word, this.config)
    if (!candidates.length) { this.hide(); return }

    this.matches = candidates
    this.selectedIndex = 0
    this.render()
    this.position(textarea)
    this.dropdown.style.display = "block"
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.matches.length) return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        this.selectedIndex = (this.selectedIndex + 1) % this.matches.length
        this.render()
        break
      case "ArrowUp":
        e.preventDefault()
        this.selectedIndex = (this.selectedIndex - 1 + this.matches.length) % this.matches.length
        this.render()
        break
      case "Tab":
      case "Enter":
        if (this.textarea) {
          e.preventDefault()
          this.complete(this.textarea, this.matches[this.selectedIndex])
        }
        break
      case "Escape":
        e.preventDefault()
        this.hide()
        break
    }
  }

  private complete(textarea: HTMLTextAreaElement, word: string): void {
    const pos   = textarea.selectionStart
    const match = textarea.value.slice(0, pos).match(WORD_RE)
    if (!match) return

    const start = pos - match[0].length
    textarea.setRangeText(word, start, pos, "end")

    // Let the controller's updateYaml handle state sync + chrome updates.
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
    this.hide()
  }

  private render(): void {
    this.dropdown.innerHTML = this.matches
      .map((m, i) => {
        const active = i === this.selectedIndex
        return `<div
          data-idx="${i}"
          role="option"
          aria-selected="${active}"
          style="
            padding: 4px 12px;
            cursor: pointer;
            color: ${active ? "#ffffff" : "#9ca3af"};
            background: ${active ? BG_HOVER : "transparent"};
            border-left: 2px solid ${active ? "#6366f1" : "transparent"};
          "
        >${m}</div>`
      })
      .join("")

    this.dropdown.querySelectorAll("[data-idx]").forEach(el => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault()
        const idx = parseInt((el as HTMLElement).dataset.idx ?? "0")
        if (this.textarea) this.complete(this.textarea, this.matches[idx])
      })
    })
  }

  private position(textarea: HTMLTextAreaElement): void {
    const rect  = textarea.getBoundingClientRect()
    const caret = caretCoordinates(textarea, textarea.selectionStart)

    const rawTop  = rect.top  + caret.top  - textarea.scrollTop  + LINE_HEIGHT + 4
    const rawLeft = rect.left + caret.left - textarea.scrollLeft

    // Flip above the cursor if the dropdown would overflow the viewport bottom
    const estimatedHeight = Math.min(this.matches.length * 28, 220)
    const top = rawTop + estimatedHeight > window.innerHeight
      ? rect.top + caret.top - textarea.scrollTop - estimatedHeight - 4
      : rawTop

    this.dropdown.style.top  = `${Math.max(0, top)}px`
    this.dropdown.style.left = `${Math.max(0, rawLeft)}px`
  }

  hide(): void {
    this.dropdown.style.display = "none"
    this.matches = []
  }

  destroy(): void {
    this.hide()
    this.sync(null)
    document.removeEventListener("mousedown", this.onDocMousedown)
    this.dropdown.remove()
  }
}

// --- Helpers ---

function currentWord(textarea: HTMLTextAreaElement): string {
  return textarea.value.slice(0, textarea.selectionStart).match(WORD_RE)?.[0] ?? ""
}

function matchCandidates(word: string, config: HighlightConfig): string[] {
  const lower = word.toLowerCase()
  return [...config.keywords, ...config.values]
    .filter(k => k.toLowerCase().startsWith(lower) && k.toLowerCase() !== lower)
    .sort()
}

// Computes the pixel offset of `position` inside a textarea using a hidden
// mirror element styled identically to the textarea.
function caretCoordinates(textarea: HTMLTextAreaElement, position: number): { top: number; left: number } {
  const cs = window.getComputedStyle(textarea)

  const mirror = document.createElement("div")
  Object.assign(mirror.style, {
    position:        "absolute",
    visibility:      "hidden",
    whiteSpace:      "pre",       // wrap="off" → no wrapping
    overflow:        "hidden",
    boxSizing:       cs.boxSizing,
    width:           cs.width,
    paddingTop:      cs.paddingTop,
    paddingRight:    cs.paddingRight,
    paddingBottom:   cs.paddingBottom,
    paddingLeft:     cs.paddingLeft,
    borderTopWidth:  cs.borderTopWidth,
    borderRightWidth:cs.borderRightWidth,
    borderBottomWidth:cs.borderBottomWidth,
    borderLeftWidth: cs.borderLeftWidth,
    fontStyle:       cs.fontStyle,
    fontWeight:      cs.fontWeight,
    fontSize:        cs.fontSize,
    lineHeight:      cs.lineHeight,
    fontFamily:      cs.fontFamily,
    letterSpacing:   cs.letterSpacing,
    wordSpacing:     cs.wordSpacing,
    tabSize:         cs.tabSize,
  })

  mirror.textContent = textarea.value.slice(0, position)
  const marker = document.createElement("span")
  marker.textContent = "\u200b"   // zero-width space marks the caret position
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const top  = marker.offsetTop
  const left = marker.offsetLeft
  document.body.removeChild(mirror)

  return { top, left }
}
