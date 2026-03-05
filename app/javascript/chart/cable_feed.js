import { consumer } from "./cable_consumer"
import connectionMonitor from "../services/connection_monitor"

export default class CableFeed {
  constructor(symbol, timeframe, onCandle) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.onCandle = onCandle
    this.subscription = null
    this._active = false
    this._onConnectionChange = this._onConnectionChange.bind(this)
  }

  connect() {
    this._active = true
    window.addEventListener("connection:change", this._onConnectionChange)

    if (!connectionMonitor.backendOnline) return

    this._subscribe()
  }

  _subscribe() {
    if (this.subscription) return
    this.subscription = consumer.subscriptions.create(
      {
        channel: "CandlesChannel",
        symbol: this.symbol,
        timeframe: this.timeframe,
      },
      {
        received: (candles) => {
          candles.forEach(candle => this.onCandle(candle))
        },
      }
    )
  }

  disconnect() {
    this._active = false
    window.removeEventListener("connection:change", this._onConnectionChange)
    this.subscription?.unsubscribe()
    this.subscription = null
  }

  _onConnectionChange(e) {
    if (e.detail.online && this._active) {
      this._subscribe()
    } else if (!e.detail.online && this.subscription) {
      this.subscription.unsubscribe()
      this.subscription = null
    }
  }
}
