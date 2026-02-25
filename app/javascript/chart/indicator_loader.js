export default class IndicatorLoader {
  constructor(indicatorType, params = {}) {
    this.indicatorType = indicatorType
    this.params = params
  }

  async compute(symbol, timeframe, startTime) {
    const body = { symbol, timeframe, ...this.params }
    if (startTime) body.start_time = new Date(startTime * 1000).toISOString()
    const response = await fetch(
      `/api/indicators/${encodeURIComponent(this.indicatorType)}/compute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.warn(`[indicator] ${this.indicatorType}: ${err.error || response.statusText}`)
      return []
    }
    const raw = await response.json()
    if (!Array.isArray(raw)) return []

    return raw
      .map(item => {
        const point = { ...item }
        point.time = Math.floor(new Date(item.date_time).getTime() / 1000)
        delete point.date_time
        return point
      })
      .sort((a, b) => a.time - b.time)
  }
}
