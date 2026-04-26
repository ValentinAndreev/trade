import connectionMonitor from "./connection_monitor"
import { showToast } from "./toast"

export async function apiFetch(url: string | URL, options?: RequestInit, config?: { silent?: boolean }): Promise<Response | null> {
  const { silent = false } = config ?? {}
  if (options?.signal?.aborted) return null

  if (!connectionMonitor.isOnline) {
    if (!silent) {
      const reason = !connectionMonitor.internetOnline ? "No internet connection" : "Server unavailable"
      showToast(reason)
    }
    return null
  }

  try {
    const response = await fetch(url, options ?? {})
    return response
  } catch (err) {
    if (isAbortError(err) || options?.signal?.aborted) return null
    if (!silent) showToast("Request failed — server may be unavailable")
    return null
  }
}

function isAbortError(error: unknown): boolean {
  return !!error && typeof error === "object" && "name" in error && error.name === "AbortError"
}
