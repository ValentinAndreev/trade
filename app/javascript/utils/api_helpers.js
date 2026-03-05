export function csrfToken() {
  return document.querySelector("meta[name='csrf-token']")?.content || ""
}

export function jsonHeaders() {
  return { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() }
}
