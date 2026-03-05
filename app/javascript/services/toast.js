import { TOAST_DURATION_MS, TOAST_FADE_MS } from "../config/constants"

let container = null

function getContainer() {
  if (container && document.body.contains(container)) return container
  container = document.createElement("div")
  container.className = "fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
  document.body.appendChild(container)
  return container
}

export function showToast(message, type = "error") {
  const el = document.createElement("div")
  const bg = type === "error" ? "bg-red-600" : type === "success" ? "bg-green-600" : "bg-gray-700"
  el.className = `pointer-events-auto px-4 py-2.5 rounded-lg text-sm text-white shadow-lg ${bg} transition-opacity duration-300`
  el.textContent = message
  getContainer().appendChild(el)

  setTimeout(() => {
    el.style.opacity = "0"
    setTimeout(() => el.remove(), TOAST_FADE_MS)
  }, TOAST_DURATION_MS)
}
