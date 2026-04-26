// Shared DOM and template utilities

export const isExternalCategory = (c?: string): boolean => c === "macro" || c === "onchain"

export function formFieldValue(root: ParentNode, field: string, fallback: string): string {
  const el = root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-field="${field}"]`)
  return el?.value || fallback
}

export function formFieldNumber(root: ParentNode, field: string, fallback: number): number {
  const el = root.querySelector<HTMLInputElement>(`[data-field="${field}"]`)
  const value = Number(el?.value)
  return Number.isFinite(value) ? value : fallback
}

export function formFieldChecked(root: ParentNode, field: string, fallback: boolean): boolean {
  const el = root.querySelector<HTMLInputElement>(`[data-field="${field}"]`)
  return el ? el.checked : fallback
}

export function escapeHTML(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
}

export function injectConditionStyles(css: string): void {
  let styleEl = document.getElementById("data-grid-condition-styles")
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = "data-grid-condition-styles"
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
}

export function dispatchWorkspaceEvent(element: Element, e: Event, bubbles = false): void {
  const el = e.currentTarget as HTMLElement
  const eventName = el.dataset.workspaceEvent
  if (!eventName) {
    if (process.env.NODE_ENV !== "production") console.warn("dispatchWorkspaceEvent: missing data-workspace-event on", el)
    return
  }
  e.stopPropagation()
  const detail: Record<string, unknown> = {}
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) detail.value = el.value
  if (e instanceof MouseEvent) detail.mouseDetail = e.detail
  if ("path" in el.dataset) detail.path = el.dataset.path!
  if (el.dataset.kind) detail.kind = el.dataset.kind
  element.dispatchEvent(new CustomEvent(eventName, { detail, bubbles }))
}

export function createInlineRenameInput(currentText: string, onCommit: (text: string) => void, cssClass?: string): HTMLInputElement {
  const input = document.createElement("input")
  input.type = "text"
  input.value = currentText
  input.className = cssClass || "w-full px-1 py-0 text-sm text-white bg-[#2a2a3e] border border-blue-400 rounded outline-none"

  const commit = () => {
    const text = input.value.trim()
    onCommit(text)
  }

  input.addEventListener("blur", commit, { once: true })
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur() }
    if (ev.key === "Escape") { input.value = currentText; input.blur() }
  })

  return input
}
