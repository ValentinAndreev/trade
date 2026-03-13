declare module "@rails/actioncable" {
  export interface Subscription {
    unsubscribe(): void
    perform(action: string, data?: Record<string, unknown>): void
    send(data: Record<string, unknown>): void
  }

  export interface Consumer {
    subscriptions: {
      create<T = unknown>(
        params: { channel: string; [key: string]: unknown },
        callbacks: { received?: (data: T) => void; connected?: () => void; disconnected?: () => void }
      ): Subscription
    }
    disconnect(): void
  }

  export function createConsumer(url?: string): Consumer
}
