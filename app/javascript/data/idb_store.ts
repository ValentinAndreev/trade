import { openDB, type IDBPDatabase } from "idb"
import type { Candle } from "../types/candle"
import type { IndicatorSeriesPoint } from "./indicator_cache"

const DB_NAME = "trade-data"
const DB_VERSION = 1

interface TradeDataSchema {
  candles: {
    key: [string, string, number]      // [symbol, timeframe, time]
    value: { symbol: string; timeframe: string; time: number; o: number; h: number; l: number; c: number; v: number; savedAt: number }
    indexes: { "by-key": [string, string] }  // [symbol, timeframe]
  }
  indicators: {
    key: [string, string, string, string, number]   // [symbol, tf, type, paramsKey, time]
    value: { symbol: string; timeframe: string; type: string; paramsKey: string; time: number; data: Record<string, number>; savedAt: number }
    indexes: { "by-key": [string, string, string, string] }
  }
}

type DB = IDBPDatabase<TradeDataSchema>

let dbPromise: Promise<DB> | null = null

function getDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = openDB<TradeDataSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("candles")) {
          const cs = db.createObjectStore("candles", { keyPath: ["symbol", "timeframe", "time"] })
          cs.createIndex("by-key", ["symbol", "timeframe"])
        }
        if (!db.objectStoreNames.contains("indicators")) {
          const is = db.createObjectStore("indicators", { keyPath: ["symbol", "timeframe", "type", "paramsKey", "time"] })
          is.createIndex("by-key", ["symbol", "timeframe", "type", "paramsKey"])
        }
      },
    }).catch(err => {
      console.warn("[IDB] Failed to open database:", err)
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

// ---------- Candles ----------

export async function idbPutCandles(symbol: string, timeframe: string, candles: Candle[]): Promise<void> {
  if (!candles.length) return
  try {
    const db = await getDb()
    const tx = db.transaction("candles", "readwrite")
    const now = Date.now()
    await Promise.all([
      ...candles.map(c => tx.store.put({
        symbol, timeframe, time: c.time,
        o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
        savedAt: now,
      })),
      tx.done,
    ])
  } catch (err) {
    console.warn("[IDB] putCandles failed:", err)
  }
}

export async function idbGetCandles(
  symbol: string,
  timeframe: string,
  startTime?: number,
  endTime?: number,
): Promise<Candle[]> {
  try {
    const db = await getDb()
    const range = IDBKeyRange.bound([symbol, timeframe], [symbol, timeframe, Infinity])
    const all = await db.getAllFromIndex("candles", "by-key", range)
    const filtered = all.filter(r =>
      (!startTime || r.time >= startTime) && (!endTime || r.time <= endTime)
    )
    return filtered
      .sort((a, b) => a.time - b.time)
      .map(r => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v }))
  } catch (err) {
    console.warn("[IDB] getCandles failed:", err)
    return []
  }
}

export async function idbClearCandles(symbol: string, timeframe: string): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction("candles", "readwrite")
    const range = IDBKeyRange.bound([symbol, timeframe], [symbol, timeframe, Infinity])
    let cursor = await tx.store.openCursor(range)
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  } catch (err) {
    console.warn("[IDB] clearCandles failed:", err)
  }
}

// ---------- Indicators ----------

export async function idbPutIndicator(
  symbol: string,
  timeframe: string,
  type: string,
  params: Record<string, unknown>,
  data: IndicatorSeriesPoint[],
): Promise<void> {
  if (!data.length) return
  try {
    const db = await getDb()
    const tx = db.transaction("indicators", "readwrite")
    const paramsKey = JSON.stringify(params ?? {})
    const now = Date.now()
    await Promise.all([
      ...data.map(point => tx.store.put({ symbol, timeframe, type, paramsKey, time: point.time, data: point, savedAt: now })),
      tx.done,
    ])
  } catch (err) {
    console.warn("[IDB] putIndicator failed:", err)
  }
}

export async function idbGetIndicator(
  symbol: string,
  timeframe: string,
  type: string,
  params: Record<string, unknown>,
): Promise<IndicatorSeriesPoint[] | null> {
  try {
    const db = await getDb()
    const paramsKey = JSON.stringify(params ?? {})
    const range = IDBKeyRange.bound(
      [symbol, timeframe, type, paramsKey],
      [symbol, timeframe, type, paramsKey, Infinity],
    )
    const all = await db.getAllFromIndex("indicators", "by-key", range)
    if (!all.length) return null
    return all.sort((a, b) => a.time - b.time).map(r => r.data)
  } catch (err) {
    console.warn("[IDB] getIndicator failed:", err)
    return null
  }
}

// ---------- Maintenance ----------

/**
 * Remove candle and indicator rows older than `maxAgeMs` milliseconds.
 * Call once at app startup to prevent unbounded storage growth.
 */
export async function idbClearOlderThan(maxAgeMs: number): Promise<void> {
  try {
    const db = await getDb()
    const cutoff = Date.now() - maxAgeMs

    const candleTx = db.transaction("candles", "readwrite")
    let candleCursor = await candleTx.store.openCursor()
    while (candleCursor) {
      if (candleCursor.value.savedAt < cutoff) await candleCursor.delete()
      candleCursor = await candleCursor.continue()
    }
    await candleTx.done

    const indTx = db.transaction("indicators", "readwrite")
    let indCursor = await indTx.store.openCursor()
    while (indCursor) {
      if (indCursor.value.savedAt < cutoff) await indCursor.delete()
      indCursor = await indCursor.continue()
    }
    await indTx.done
  } catch (err) {
    console.warn("[IDB] clearOlderThan failed:", err)
  }
}

export async function idbClearAll(): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction(["candles", "indicators"], "readwrite")
    await Promise.all([
      tx.objectStore("candles").clear(),
      tx.objectStore("indicators").clear(),
      tx.done,
    ])
  } catch (err) {
    console.warn("[IDB] clearAll failed:", err)
  }
}
