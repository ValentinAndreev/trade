import type { Candle } from "../../types/candle"

type OnCandle = (candle: Candle) => void
type FeedFactory = (onCandle: OnCandle) => { connect(): void; disconnect(): void }

interface RegistryEntry {
  callbacks: Set<OnCandle>
  feed: { connect(): void; disconnect(): void }
  connected: boolean
}

class FeedHandle {
  constructor(
    private readonly _connect: () => void,
    private readonly _disconnect: () => void
  ) {}
  connect() { this._connect() }
  disconnect() { this._disconnect() }
}

class FeedRegistry {
  private entries = new Map<string, RegistryEntry>()

  acquire(key: string, factory: FeedFactory, onCandle: OnCandle): FeedHandle {
    let entry = this.entries.get(key)
    if (!entry) {
      const dispatcher: OnCandle = (candle) => entry!.callbacks.forEach(cb => cb(candle))
      entry = { callbacks: new Set(), feed: factory(dispatcher), connected: false }
      this.entries.set(key, entry)
    }
    entry.callbacks.add(onCandle)

    return new FeedHandle(
      () => {
        if (!entry!.connected) { entry!.feed.connect(); entry!.connected = true }
      },
      () => {
        entry!.callbacks.delete(onCandle)
        if (entry!.callbacks.size === 0) {
          entry!.feed.disconnect()
          entry!.connected = false
          this.entries.delete(key)
        }
      }
    )
  }
}

export const cableRegistry = new FeedRegistry()
export const bfxRegistry = new FeedRegistry()
