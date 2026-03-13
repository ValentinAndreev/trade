import type { Candle } from "../../types/candle"
import type { Subscription } from "@rails/actioncable"
import { consumer } from "./cable_consumer"
import connectionMonitor from "../../services/connection_monitor"

export default class CableFeed {
  symbol: string
  timeframe: string
  onCandle: (candle: Candle) => void
  subscription: Subscription | null
  _active: boolean

  constructor(symbol: string, timeframe: string, onCandle: (candle: Candle) => void) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.onCandle = onCandle
    this.subscription = null
    this._active = false
    this._onConnectionChange = this._onConnectionChange.bind(this)
  }

  connect(): void {
    this._active = true
    window.addEventListener("connection:change", this._onConnectionChange)

    // Cable requires our backend (Action Cable server)
    if (!connectionMonitor.backendOnline) return

    this._subscribe()
  }

  _subscribe(): void {
    if (this.subscription) return
    this.subscription = consumer.subscriptions.create<Candle[]>(
      {
        channel: "CandlesChannel",
        symbol: this.symbol,
        timeframe: this.timeframe,
      },
      {
        received: (candles: Candle[]) => {
          candles.forEach((candle: Candle) => this.onCandle(candle))
        },
      }
    )
  }

  disconnect(): void {
    this._active = false
    window.removeEventListener("connection:change", this._onConnectionChange)
    this.subscription?.unsubscribe()
    this.subscription = null
  }

  _onConnectionChange(e: Event & { detail?: { online?: boolean } }): void {
    if (e.detail?.online && this._active) {
      this._subscribe()
    } else if (!e.detail?.online && this.subscription) {
      this.subscription.unsubscribe()
      this.subscription = null
    }
  }
}
