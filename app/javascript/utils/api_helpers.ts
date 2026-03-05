export function csrfToken(): string {
  return (document.querySelector("meta[name='csrf-token']") as HTMLMetaElement | null)?.content || ""
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() }
}
