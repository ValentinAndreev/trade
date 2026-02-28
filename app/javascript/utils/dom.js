// Shared DOM utilities

export function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
}

export function createInlineRenameInput(currentText, onCommit, cssClass) {
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
