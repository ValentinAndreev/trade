import type { Subscription } from "@rails/actioncable"
import { consumer } from "../chart/feeds/cable_consumer"

type ResearchProgressEvent = "started" | "progress" | "completed" | "failed"

type ResearchProgressMessage = {
  event?: ResearchProgressEvent
  total_runs?: number
  completed_runs?: number
  elapsed_ms?: number
  last_run_ms?: number
  current_value?: number
  error?: string
}

export type ResearchProgressSnapshot = {
  event: ResearchProgressEvent
  totalRuns: number
  completedRuns: number
  elapsedMs: number
  lastRunMs: number | null
  currentValue: number | null
  error: string | null
}

export class ResearchProgressSubscription {
  private subscription: Subscription | null = null

  constructor(
    private runId: string,
    private onUpdate: (snapshot: ResearchProgressSnapshot) => void,
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

      this.subscription = consumer.subscriptions.create<ResearchProgressMessage>(
        {
          channel: "ResearchProgressChannel",
          run_id: this.runId,
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
            const snapshot = normalizeResearchProgress(payload)
            if (snapshot) this.onUpdate(snapshot)
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

export function buildResearchRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `research-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeResearchProgress(payload: ResearchProgressMessage): ResearchProgressSnapshot | null {
  if (!payload.event) return null

  return {
    event: payload.event,
    totalRuns: Math.max(0, Number(payload.total_runs || 0)),
    completedRuns: Math.max(0, Number(payload.completed_runs || 0)),
    elapsedMs: Math.max(0, Number(payload.elapsed_ms || 0)),
    lastRunMs: payload.last_run_ms == null ? null : Math.max(0, Number(payload.last_run_ms)),
    currentValue: payload.current_value == null ? null : Number(payload.current_value),
    error: payload.error || null,
  }
}
