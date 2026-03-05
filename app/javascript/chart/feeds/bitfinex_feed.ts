import type { Candle } from "../../types/candle"
import connectionMonitor from "../../services/connection_monitor"
import { RECONNECT_DELAY_MS } from "../../config/constants"

function bfxTimeframe(tf: string): string {
  return tf.replace(/([dw])$/i, (ch) => ch.toUpperCase())
}

export default class BitfinexFeed {
  symbol: string
  timeframe: string
  onCandle: (candle: Candle) => void
  reconnect: boolean
  ws: WebSocket | null

  constructor(symbol: string, timeframe: string, onCandle: (candle: Candle) => void) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.onCandle = onCandle
    this.reconnect = true
    this.ws = null
    this._onConnectionChange = this._onConnectionChange.bind(this)
  }

  connect(): void {
    this.reconnect = true
    window.addEventListener("connection:change", this._onConnectionChange)

    // Bitfinex is a public WebSocket — only needs internet, not our backend
    if (!connectionMonitor.internetOnline) return

    this._openSocket()
  }

  _openSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return

    const key = `trade:${bfxTimeframe(this.timeframe)}:t${this.symbol}`
    const ws = new WebSocket("wss://api-pub.bitfinex.com/ws/2")

    ws.onopen = () => {
      ws.send(JSON.stringify({ event: "subscribe", channel: "candles", key }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.event) return
      if (msg[1] === "hb") return
      if (Array.isArray(msg[1][0])) return

      const raw = msg[1]
      if (!Array.isArray(raw) || raw.length < 6) return

      const [mts, open, close, high, low, volume] = raw
      const time = Math.floor(mts / 1000)
      if (!Number.isFinite(time) || time <= 0) return

      this.onCandle({ time, open, high, low, close, volume })
    }

    ws.onclose = () => {
      if (this.reconnect && connectionMonitor.internetOnline) {
        setTimeout(() => this._openSocket(), RECONNECT_DELAY_MS)
      }
    }
    ws.onerror = () => ws.close()
    this.ws = ws
  }

  disconnect(): void {
    this.reconnect = false
    window.removeEventListener("connection:change", this._onConnectionChange)
    this.ws?.close()
  }

  _onConnectionChange(e: Event & { detail?: { online?: boolean } }): void {
    if (e.detail?.online && this.reconnect) {
      this._openSocket()
    }
  }
}
