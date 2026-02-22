// Map timeframes to Bitfinex format: 1d→1D, 1w→1W (minutes/hours stay lowercase)
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
  }

  connect() {
    this.reconnect = true
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
      if (this.reconnect) setTimeout(() => this.connect(), 3000)
    }
    ws.onerror = () => ws.close()
    this.ws = ws
  }

  disconnect() {
    this.reconnect = false
    this.ws?.close()
  }
}
