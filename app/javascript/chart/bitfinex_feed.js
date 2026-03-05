import connectionMonitor from "../services/connection_monitor"

function bfxTimeframe(tf) {
  return tf.replace(/([dw])$/i, (ch) => ch.toUpperCase())
}

export default class BitfinexFeed {
  constructor(symbol, timeframe, onCandle) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.onCandle = onCandle
    this.reconnect = true
    this.ws = null
    this._onConnectionChange = this._onConnectionChange.bind(this)
  }

  connect() {
    this.reconnect = true
    window.addEventListener("connection:change", this._onConnectionChange)

    if (!connectionMonitor.internetOnline) return

    this._openSocket()
  }

  _openSocket() {
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
        setTimeout(() => this._openSocket(), 3000)
      }
    }
    ws.onerror = () => ws.close()
    this.ws = ws
  }

  disconnect() {
    this.reconnect = false
    window.removeEventListener("connection:change", this._onConnectionChange)
    this.ws?.close()
  }

  _onConnectionChange(e) {
    if (e.detail.online && this.reconnect) {
      this._openSocket()
    }
  }
}
