export default class IndicatorLoader {
  constructor(symbol, timeframe, indicatorType, params = {}) {
    this.symbol = symbol
    this.timeframe = timeframe
    this.indicatorType = indicatorType
    this.params = params
    this.data = []
  }

  async load() {
    const url = new URL(`/api/indicators/${encodeURIComponent(this.indicatorType)}`, window.location.origin)
    url.searchParams.set("symbol", this.symbol)
    url.searchParams.set("timeframe", this.timeframe)
    for (const [key, value] of Object.entries(this.params)) {
      url.searchParams.set(key, String(value))
    }

    const response = await fetch(url)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.warn(`[indicator] ${this.indicatorType}: ${err.error || response.statusText}`)
      this.data = []
      return this.data
    }
    const raw = await response.json()
    if (!Array.isArray(raw)) {
      this.data = []
      return this.data
    }

    this.data = raw.map(item => {
      const point = { ...item }
      point.time = Math.floor(new Date(item.date_time).getTime() / 1000)
      delete point.date_time
      return point
    })

    this.data.sort((a, b) => a.time - b.time)

    return this.data
  }
}
