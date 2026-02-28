import { consumer } from "./cable_consumer"

export default class CableFeed {
  constructor(symbol, timeframe, onCandle) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.onCandle = onCandle
    this.subscription = null
  }

  connect() {
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
    this.subscription?.unsubscribe()
  }
}
