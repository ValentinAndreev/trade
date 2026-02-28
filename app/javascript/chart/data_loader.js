export default class DataLoader {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
    this.isLoading = false
    this.allLoaded = false
    this.oldestTime = null
    this.candles = []
  }

  async loadInitial() {
    const response = await fetch(this.baseUrl)
    const data = await response.json()
    this.candles = data
    if (data.length > 0) {
      this.oldestTime = data[0].time
    }
    return this.candles
  }

  async loadMoreHistory() {
    if (this.isLoading || this.allLoaded || !this.oldestTime) return null

    this.isLoading = true
    try {
      const endTime = new Date(this.oldestTime * 1000).toISOString()
      const url = new URL(this.baseUrl, window.location.origin)
      url.searchParams.set("end_time", endTime)
      url.searchParams.set("limit", "500")

      const response = await fetch(url)
      const newCandles = await response.json()

      if (newCandles.length === 0) {
        this.allLoaded = true
        return null
      }

      const filtered = newCandles.filter(c => c.time < this.oldestTime)
      if (filtered.length === 0) {
        this.allLoaded = true
        return null
      }

      this.candles = [...filtered, ...this.candles]
      this.oldestTime = this.candles[0].time
      return filtered
    } catch (error) {
      console.error("Failed to load history:", error)
      return null
    } finally {
      this.isLoading = false
    }
  }

  prependCandles(newCandles) {
    if (!newCandles || newCandles.length === 0) return
    const filtered = this.oldestTime
      ? newCandles.filter(c => c.time < this.oldestTime)
      : newCandles
    if (filtered.length === 0) return
    this.candles = [...filtered, ...this.candles]
    this.oldestTime = this.candles[0].time
  }

  updateCandle(candle) {
    const idx = this.candles.findIndex(c => c.time === candle.time)
    if (idx !== -1) {
      this.candles[idx] = candle
    } else if (this.candles.length === 0 || candle.time > this.candles[this.candles.length - 1].time) {
      this.candles.push(candle)
    }
  }
}
