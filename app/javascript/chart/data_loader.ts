import { apiFetch } from "../services/api_fetch"
import { HISTORY_LOAD_LIMIT } from "../config/constants"
import type { Candle } from "../types/candle"
import candleCache from "../data/candle_cache"

export default class DataLoader {
  baseUrl: string
  isLoading: boolean
  allLoaded: boolean
  oldestTime: number | null
  candles: Candle[]

  symbol: string | null = null
  timeframe: string | null = null

  constructor(baseUrl: string, symbol?: string, timeframe?: string) {
    this.baseUrl = baseUrl
    this.isLoading = false
    this.allLoaded = false
    this.oldestTime = null
    this.candles = []
    this.symbol = symbol ?? null
    this.timeframe = timeframe ?? null
  }

  private syncToCache(): void {
    if (this.symbol && this.timeframe) {
      candleCache.setCandles(this.symbol, this.timeframe, this.candles)
    }
  }

  async loadInitial(): Promise<Candle[]> {
    // 1. Restore from IndexedDB — chart renders immediately without waiting for server.
    if (this.symbol && this.timeframe) {
      await candleCache.hydrate(this.symbol, this.timeframe)
      const cached = candleCache.get(this.symbol, this.timeframe)
      if (cached.length) {
        this.candles = cached
        this.oldestTime = cached[0].time
      }
    }

    // 2. Smart server fetch based on what IDB had.
    if (this.candles.length > 0 && this.timeframe) {
      return this.loadIncrementalUpdate()
    }

    // 3. No IDB data — full initial load.
    const response = await apiFetch(this.baseUrl, {}, { silent: true })
    if (!response) return this.candles
    const data: Candle[] = await response.json()
    this.candles = data
    if (data.length > 0) this.oldestTime = data[0].time
    this.syncToCache()
    return this.candles
  }

  /**
   * Fetch only candles newer than what we already have in the cache.
   * - If cache is fresh (newest candle within 2 periods of now) → skip request entirely.
   * - Otherwise → fetch the gap and merge, replacing the last (possibly incomplete) candle.
   */
  private async loadIncrementalUpdate(): Promise<Candle[]> {
    const newestTime = this.candles[this.candles.length - 1].time
    const startIso = new Date(newestTime * 1000).toISOString()
    const url = new URL(this.baseUrl, window.location.origin)
    url.searchParams.delete("limit")   // no limit needed — fetching a small known gap
    url.searchParams.set("start_time", startIso)

    const response = await apiFetch(url, {}, { silent: true })
    if (!response) return this.candles

    const fresh: Candle[] = await response.json()
    if (!fresh.length) return this.candles

    // Replace last known candle (may have been incomplete at the time of save)
    // and append everything newer.
    const base = this.candles.slice(0, -1)
    const merged = [...base, ...fresh.filter(c => c.time >= newestTime)]
    this.candles = merged
    this.oldestTime = merged[0].time
    this.syncToCache()
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
      this.syncToCache()
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
    this.syncToCache()
  }

  updateCandle(candle: Candle): void {
    const idx = this.candles.findIndex(c => c.time === candle.time)
    if (idx !== -1) {
      this.candles[idx] = candle
    } else if (this.candles.length === 0 || candle.time > this.candles[this.candles.length - 1].time) {
      this.candles.push(candle)
    }
    if (this.symbol && this.timeframe) {
      candleCache.updateCandle(this.symbol, this.timeframe, candle)
    }
  }
}
