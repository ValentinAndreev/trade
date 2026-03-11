import type { Candle } from "../types/candle"
import { idbPutCandles, idbGetCandles, idbClearCandles } from "./idb_store"

type CacheKey = string
type Listener = (candles: Candle[]) => void

interface CacheEntry {
  candles: Candle[]
  listeners: Set<Listener>
}

function cacheKey(symbol: string, timeframe: string): CacheKey {
  return `${symbol.toUpperCase()}:${timeframe}`
}

class CandleCache {
  private entries = new Map<CacheKey, CacheEntry>()

  private getOrCreate(key: CacheKey): CacheEntry {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { candles: [], listeners: new Set() }
      this.entries.set(key, entry)
    }
    return entry
  }

  get(symbol: string, timeframe: string): Candle[] {
    const entry = this.entries.get(cacheKey(symbol, timeframe))
    return entry ? entry.candles : []
  }

  getRange(symbol: string, timeframe: string, startTime?: number, endTime?: number): Candle[] {
    const candles = this.get(symbol, timeframe)
    if (!startTime && !endTime) return candles
    return candles.filter(c => {
      if (startTime && c.time < startTime) return false
      if (endTime && c.time > endTime) return false
      return true
    })
  }

  hasRange(symbol: string, timeframe: string, startTime: number, endTime: number): boolean {
    const candles = this.get(symbol, timeframe)
    if (candles.length === 0) return false
    return candles[0].time <= startTime && candles[candles.length - 1].time >= endTime
  }

  oldestTime(symbol: string, timeframe: string): number | null {
    const candles = this.get(symbol, timeframe)
    return candles.length ? candles[0].time : null
  }

  newestTime(symbol: string, timeframe: string): number | null {
    const candles = this.get(symbol, timeframe)
    return candles.length ? candles[candles.length - 1].time : null
  }

  setCandles(symbol: string, timeframe: string, candles: Candle[]): void {
    const key = cacheKey(symbol, timeframe)
    const entry = this.getOrCreate(key)
    entry.candles = candles
    this.notify(key, entry)
    idbPutCandles(symbol, timeframe, candles)
  }

  prependCandles(symbol: string, timeframe: string, newCandles: Candle[]): void {
    if (!newCandles.length) return
    const key = cacheKey(symbol, timeframe)
    const entry = this.getOrCreate(key)
    const oldest = entry.candles[0]?.time ?? Infinity
    const filtered = newCandles.filter(c => c.time < oldest)
    if (!filtered.length) return
    entry.candles = [...filtered, ...entry.candles]
    this.notify(key, entry)
    idbPutCandles(symbol, timeframe, filtered)
  }

  updateCandle(symbol: string, timeframe: string, candle: Candle): void {
    const key = cacheKey(symbol, timeframe)
    const entry = this.getOrCreate(key)
    const idx = entry.candles.findIndex(c => c.time === candle.time)
    if (idx !== -1) {
      entry.candles[idx] = candle
    } else if (!entry.candles.length || candle.time > entry.candles[entry.candles.length - 1].time) {
      entry.candles.push(candle)
    }
    this.notify(key, entry)
    idbPutCandles(symbol, timeframe, [candle])
  }

  subscribe(symbol: string, timeframe: string, listener: Listener): () => void {
    const key = cacheKey(symbol, timeframe)
    const entry = this.getOrCreate(key)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  /**
   * Cold-start: populate in-memory cache from IndexedDB if currently empty.
   * Called before the first API fetch so the chart/grid can render immediately.
   * Notifies listeners if data is restored.
   */
  async hydrate(symbol: string, timeframe: string): Promise<void> {
    const key = cacheKey(symbol, timeframe)
    const existing = this.entries.get(key)
    if (existing?.candles.length) return   // already warm

    try {
      const candles = await idbGetCandles(symbol, timeframe)
      if (!candles.length) return
      const entry = this.getOrCreate(key)
      entry.candles = candles
      this.notify(key, entry)
    } catch {
      // IDB unavailable (private mode etc.) — silent fallback to empty cache
    }
  }

  private notify(key: CacheKey, entry: CacheEntry): void {
    for (const listener of entry.listeners) {
      try { listener(entry.candles) } catch (e) { console.error("[CandleCache] listener error:", e) }
    }
  }

  clear(symbol: string, timeframe: string): void {
    this.entries.delete(cacheKey(symbol, timeframe))
    idbClearCandles(symbol, timeframe)
  }

  clearAll(): void {
    this.entries.clear()
    // Note: full IDB clear is handled separately via idbClearAll() if needed
  }
}

const candleCache = new CandleCache()
export default candleCache
