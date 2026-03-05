import { apiFetch } from "../services/api_fetch"
import { HISTORY_LOAD_LIMIT } from "../config/constants"
import type { Candle } from "../types/candle"

export default class DataLoader {
  baseUrl: string
  isLoading: boolean
  allLoaded: boolean
  oldestTime: number | null
  candles: Candle[]

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this.isLoading = false
    this.allLoaded = false
    this.oldestTime = null
    this.candles = []
  }

  async loadInitial(): Promise<Candle[]> {
    const response = await apiFetch(this.baseUrl, {}, { silent: true })
    if (!response) return this.candles
    const data = await response.json()
    this.candles = data
    if (data.length > 0) {
      this.oldestTime = data[0].time
    }
    return this.candles
  }

  async loadMoreHistory(): Promise<Candle[] | null> {
    if (this.isLoading || this.allLoaded || !this.oldestTime) return null

    this.isLoading = true
    try {
      const endTime = new Date(this.oldestTime * 1000).toISOString()
      const url = new URL(this.baseUrl, window.location.origin)
      url.searchParams.set("end_time", endTime)
      url.searchParams.set("limit", String(HISTORY_LOAD_LIMIT))

      const response = await apiFetch(url, {}, { silent: true })
      if (!response) return null
      const newCandles = await response.json()

      if (newCandles.length === 0) {
        this.allLoaded = true
        return null
      }

      const ot = this.oldestTime!
      const filtered = newCandles.filter((c: Candle) => c.time < ot)
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

  prependCandles(newCandles: Candle[]): void {
    if (!newCandles || newCandles.length === 0) return
    const ot = this.oldestTime
    const filtered = ot ? newCandles.filter(c => c.time < ot) : newCandles
    if (filtered.length === 0) return
    this.candles = [...filtered, ...this.candles]
    this.oldestTime = this.candles[0]!.time
  }

  updateCandle(candle: Candle): void {
    const idx = this.candles.findIndex(c => c.time === candle.time)
    if (idx !== -1) {
      this.candles[idx] = candle
    } else if (this.candles.length === 0 || candle.time > this.candles[this.candles.length - 1].time) {
      this.candles.push(candle)
    }
  }
}
