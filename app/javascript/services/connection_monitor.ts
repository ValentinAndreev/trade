import { showToast } from "./toast"
import { consumer } from "../chart/feeds/cable_consumer"
import {
  PING_INTERVAL_MS, PING_TIMEOUT_MS,
  CONNECTION_ONLINE_COLOR, CONNECTION_OFFLINE_COLOR, CONNECTION_EXCHANGE_OFFLINE_COLOR,
} from "../config/constants"

class ConnectionMonitor {
  backendOnline: boolean
  internetOnline: boolean
  bitfinexReachable: boolean
  _interval: ReturnType<typeof setInterval> | null
  _started: boolean
  _subscription: ReturnType<typeof consumer.subscriptions.create> | null

  constructor() {
    this.backendOnline = true
    this.internetOnline = navigator.onLine
    this.bitfinexReachable = true
    this._interval = null
    this._started = false
    this._subscription = null
  }

  get isOnline() {
    return this.backendOnline && this.internetOnline
  }

  start(): void {
    if (this._started) return
    this._started = true

    window.addEventListener("online", this._onBrowserOnline)
    window.addEventListener("offline", this._onBrowserOffline)

    this._ping()
    this._interval = setInterval(() => this._ping(), PING_INTERVAL_MS)
    this._subscribeToExchangeStatus()
    this._updateUI()
  }

  stop(): void {
    this._started = false
    window.removeEventListener("online", this._onBrowserOnline)
    window.removeEventListener("offline", this._onBrowserOffline)
    if (this._interval) clearInterval(this._interval)
    this._interval = null
    this._subscription?.unsubscribe()
    this._subscription = null
  }

  requireOnline(actionLabel: string): boolean {
    if (this.isOnline) return true
    const reason = !this.internetOnline ? "No internet connection" : "Server unavailable"
    showToast(`${reason} — cannot ${actionLabel}`)
    return false
  }

  // --- Private ---

  _onBrowserOnline = (): void => {
    this.internetOnline = true
    this._ping()
  }

  _onBrowserOffline = (): void => {
    this.internetOnline = false
    this._emitChange()
  }

  async _ping(): Promise<void> {
    if (!this.internetOnline) {
      if (this.backendOnline) {
        this.backendOnline = false
        this._emitChange()
      }
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)

    try {
      const resp = await fetch("/api/health", { signal: controller.signal })
      clearTimeout(timeout)
      const wasOffline = !this.backendOnline
      this.backendOnline = resp.ok || resp.status === 204
      if (wasOffline && this.backendOnline) this._emitChange()
      else if (!wasOffline && !this.backendOnline) this._emitChange()

      // Parse bitfinex status from JSON response
      if (resp.ok && resp.headers.get("content-type")?.includes("application/json")) {
        try {
          const body = await resp.json()
          if (typeof body.bitfinex === "boolean") this._updateBitfinexStatus(body.bitfinex)
        } catch { /* ignore parse errors */ }
      }
    } catch {
      clearTimeout(timeout)
      if (this.backendOnline) {
        this.backendOnline = false
        this._emitChange()
      }
    }
  }

  _subscribeToExchangeStatus(): void {
    this._subscription = consumer.subscriptions.create("ExchangeStatusChannel", {
      received: (data: { bitfinex?: boolean }) => {
        if (typeof data.bitfinex === "boolean") this._updateBitfinexStatus(data.bitfinex)
      },
    })
  }

  _updateBitfinexStatus(reachable: boolean): void {
    if (this.bitfinexReachable === reachable) return
    this.bitfinexReachable = reachable
    if (!reachable) {
      showToast("Bitfinex unreachable — live data paused")
    } else {
      showToast("Bitfinex reconnected")
    }
    this._emitExchangeChange()
    this._updateUI()
  }

  _emitChange(): void {
    this._updateUI()
    window.dispatchEvent(
      new CustomEvent("connection:change", { detail: { online: this.isOnline } })
    )
  }

  _emitExchangeChange(): void {
    window.dispatchEvent(
      new CustomEvent("exchange:change", { detail: { bitfinex: this.bitfinexReachable } })
    )
  }

  _updateUI(): void {
    let color: string
    if (!this.isOnline) {
      color = CONNECTION_OFFLINE_COLOR           // red — backend/internet down
    } else if (!this.bitfinexReachable) {
      color = CONNECTION_EXCHANGE_OFFLINE_COLOR  // amber — backend ok, exchange unreachable
    } else {
      color = CONNECTION_ONLINE_COLOR            // green — all good
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${color}"/></svg>`
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][type='image/svg+xml']")
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

const monitor: ConnectionMonitor = new ConnectionMonitor()
export default monitor
