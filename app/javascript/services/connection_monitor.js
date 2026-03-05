import { showToast } from "./toast"

const PING_INTERVAL = 5000
const PING_TIMEOUT = 3000

class ConnectionMonitor {
  constructor() {
    this.backendOnline = true
    this.internetOnline = navigator.onLine
    this._interval = null
    this._baseTitle = null
    this._started = false
  }

  get isOnline() {
    return this.backendOnline && this.internetOnline
  }

  start() {
    if (this._started) return
    this._started = true

    window.addEventListener("online", this._onBrowserOnline)
    window.addEventListener("offline", this._onBrowserOffline)

    this._ping()
    this._interval = setInterval(() => this._ping(), PING_INTERVAL)
    this._updateUI()
  }

  stop() {
    this._started = false
    window.removeEventListener("online", this._onBrowserOnline)
    window.removeEventListener("offline", this._onBrowserOffline)
    if (this._interval) clearInterval(this._interval)
    this._interval = null
  }

  requireOnline(actionLabel) {
    if (this.isOnline) return true
    const reason = !this.internetOnline ? "No internet connection" : "Server unavailable"
    showToast(`${reason} — cannot ${actionLabel}`)
    return false
  }

  // --- Private ---

  _onBrowserOnline = () => {
    this.internetOnline = true
    this._ping()
  }

  _onBrowserOffline = () => {
    this.internetOnline = false
    this._emitChange()
  }

  async _ping() {
    if (!this.internetOnline) {
      if (this.backendOnline) {
        this.backendOnline = false
        this._emitChange()
      }
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT)

    try {
      const resp = await fetch("/api/health", { signal: controller.signal })
      clearTimeout(timeout)
      const wasOffline = !this.backendOnline
      this.backendOnline = resp.ok || resp.status === 204
      if (wasOffline && this.backendOnline) this._emitChange()
      else if (!wasOffline && !this.backendOnline) this._emitChange()
    } catch {
      clearTimeout(timeout)
      if (this.backendOnline) {
        this.backendOnline = false
        this._emitChange()
      }
    }
  }

  _emitChange() {
    this._updateUI()
    window.dispatchEvent(
      new CustomEvent("connection:change", { detail: { online: this.isOnline } })
    )
  }

  _updateUI() {
    const color = this.isOnline ? "#22c55e" : "#ef4444"
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${color}"/></svg>`
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`

    let link = document.querySelector("link[rel='icon'][type='image/svg+xml']")
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      link.type = "image/svg+xml"
      document.head.appendChild(link)
    }
    link.href = url

    const pngLink = document.querySelector("link[rel='icon'][type='image/png']")
    if (pngLink) pngLink.remove()
  }
}

const monitor = new ConnectionMonitor()
export default monitor
