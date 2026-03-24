import type { Subscription } from "@rails/actioncable"
import { consumer } from "../chart/feeds/cable_consumer"
import type { AssistantChatPayload } from "./assistant_api"

export class AssistantChatSubscription {
  private subscription: Subscription | null = null

  constructor(
    private chatId: number,
    private onUpdate: (payload: AssistantChatPayload) => void,
  ) {}

  connect(): Promise<void> {
    if (this.subscription) return Promise.resolve()

    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const timeoutId = window.setTimeout(finish, 500)

      this.subscription = consumer.subscriptions.create<AssistantChatPayload>(
        {
          channel: "SystemEditorChatChannel",
          chat_id: this.chatId,
        },
        {
          connected: () => {
            clearTimeout(timeoutId)
            finish()
          },
          rejected: () => {
            clearTimeout(timeoutId)
            finish()
          },
          received: (payload) => {
            if (!payload?.chat || !Array.isArray(payload.messages)) return
            this.onUpdate(payload)
          },
        }
      )
    })
  }

  disconnect(): void {
    this.subscription?.unsubscribe()
    this.subscription = null
  }
}
