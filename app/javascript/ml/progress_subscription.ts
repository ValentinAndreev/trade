import type { Subscription } from "@rails/actioncable"
import { consumer } from "../chart/feeds/cable_consumer"

export type MlTrainingProgressEvent = "queued" | "running" | "progress" | "succeeded" | "failed" | "cancelled"

export interface MlTrainingProgressSnapshot {
  event: MlTrainingProgressEvent
  training_run_id: number
  status: string | null
  model_key: string | null
  metrics: Record<string, number | string | boolean | null>
  error: Record<string, number | string | boolean | null>
  duration_ms: number | null
  heartbeat_at: string | null
  started_at: string | null
  finished_at: string | null
  progress_percent?: number
}

export class MlTrainingProgressSubscription {
  private subscription: Subscription | null = null

  constructor(
    private trainingRunId: number,
    private onUpdate: (snapshot: MlTrainingProgressSnapshot) => void,
    private onRejected: () => void,
  ) {}

  connect(): Promise<void> {
    if (this.subscription) return Promise.resolve()

    return new Promise(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const timeoutId = window.setTimeout(finish, 500)

      this.subscription = consumer.subscriptions.create<MlTrainingProgressSnapshot>(
        {
          channel: "MlTrainingProgressChannel",
          training_run_id: this.trainingRunId,
        },
        {
          connected: () => {
            window.clearTimeout(timeoutId)
            finish()
          },
          rejected: () => {
            window.clearTimeout(timeoutId)
            this.onRejected()
            finish()
          },
          received: payload => this.onUpdate(payload),
        },
      )
    })
  }

  disconnect(): void {
    this.subscription?.unsubscribe()
    this.subscription = null
  }
}
