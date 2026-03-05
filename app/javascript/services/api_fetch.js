import connectionMonitor from "./connection_monitor"
import { showToast } from "./toast"

export async function apiFetch(url, options = {}, { silent = false } = {}) {
  if (!connectionMonitor.isOnline) {
    if (!silent) {
      const reason = !connectionMonitor.internetOnline ? "No internet connection" : "Server unavailable"
      showToast(reason)
    }
    return null
  }

  try {
    const response = await fetch(url, options)
    return response
  } catch (err) {
    if (!silent) showToast("Request failed — server may be unavailable")
    return null
  }
}
