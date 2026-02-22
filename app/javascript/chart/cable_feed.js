import { createConsumer } from "@rails/actioncable"

export default class CableFeed {
  constructor(symbol, timeframe, onCandle) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.onCandle = onCandle
    this.consumer = createConsumer()
    this.subscription = null
  }

  connect() {
    this.subscription = this.consumer.subscriptions.create(
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
    this.consumer?.disconnect()
  }
}
