import { Controller } from "@hotwired/stimulus"
import { cancelMlTrainingRun, createMlTrainingRun, fetchMlModels, type MlModelSummary } from "../ml/api"
import type { MlTrainingRunCreatePayload } from "../ml/api"
import { MlTrainingProgressSubscription, type MlTrainingProgressSnapshot } from "../ml/progress_subscription"
import { renderMlModelsHTML, type MlModelsViewState } from "../ml/templates"

export default class extends Controller {
  static values = {
    tabId: String,
    config: String,
  }

  declare tabIdValue: string
  declare configValue: string

  private models: MlModelSummary[] = []
  private state: MlModelsViewState = "loading"
  private errorMessage: string | null = null
  private trainingBusy = false
  private trainingError: string | null = null
  private abortController: AbortController | null = null
  private progressByRunId = new Map<number, MlTrainingProgressSnapshot>()
  private progressSubscriptions = new Map<number, MlTrainingProgressSubscription>()

  connect() {
    void this.refresh()
  }

  disconnect() {
    this.abortController?.abort()
    this.abortController = null
    this.disconnectProgressSubscriptions()
  }

  async refresh() {
    this.abortController?.abort()
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    this.state = "loading"
    this.errorMessage = null
    this.render()

    try {
      this.models = await fetchMlModels(signal)
      this.state = "loaded"
      void this.syncProgressSubscriptions().catch(error => {
        console.error("[ML Models] Progress subscription sync failed:", error)
        this.trainingError = "ML progress subscription failed"
        this.render()
      })
    } catch (error) {
      if (signal.aborted) return
      console.error("[ML Models] Load failed:", error)
      this.models = []
      this.state = "failed"
      this.errorMessage = "ML models failed to load"
    }
    this.render()
  }

  async createTrainingRun(event: Event) {
    event.preventDefault()
    if (this.trainingBusy) return
    this.trainingBusy = true
    this.trainingError = null
    this.render()

    try {
      const run = await createMlTrainingRun(this.trainingPayload())
      await this.ensureProgressSubscription(run.id)
      await this.refresh()
    } catch (error) {
      this.trainingError = error instanceof Error ? error.message : "ML training run failed"
    } finally {
      this.trainingBusy = false
      this.render()
    }
  }

  async cancelTrainingRun(event: Event) {
    event.preventDefault()
    const trainingRunId = Number((event.currentTarget as HTMLElement).dataset.trainingRunId)
    this.trainingError = null
    try {
      await cancelMlTrainingRun(trainingRunId)
      await this.refresh()
    } catch (error) {
      this.trainingError = error instanceof Error ? error.message : "ML training cancel failed"
      this.render()
    }
  }

  private render() {
    this.element.innerHTML = renderMlModelsHTML({
      state: this.state,
      models: this.models,
      errorMessage: this.errorMessage,
      trainingBusy: this.trainingBusy,
      trainingError: this.trainingError,
      progressByRunId: this.progressByRunId,
    })
  }

  private trainingPayload(): MlTrainingRunCreatePayload {
    const modelKey = this.field<HTMLInputElement>("modelKey").value.trim()
    const symbol = this.field<HTMLInputElement>("symbol").value.trim()
    const exchange = this.field<HTMLInputElement>("exchange").value.trim()
    const timeframe = this.field<HTMLInputElement>("timeframe").value.trim()
    const labelHorizon = this.numericField("labelHorizon")
    const maxIterations = this.numericField("maxIterations")
    return {
      model_key: modelKey,
      display_name: modelKey,
      dataset_spec: { symbol, exchange, timeframe, label_horizon: labelHorizon },
      feature_spec: [{ type: "log_return", params: { period: 1 } }],
      hyperparams: { seed: 0, max_iterations: maxIterations },
    }
  }

  private async syncProgressSubscriptions() {
    const activeRunIds = this.models
      .map(model => model.active_training_run?.id)
      .filter((id): id is number => id !== undefined)
    for (const trainingRunId of activeRunIds) await this.ensureProgressSubscription(trainingRunId)
    for (const trainingRunId of this.progressSubscriptions.keys()) {
      if (activeRunIds.includes(trainingRunId)) continue
      this.progressSubscriptions.get(trainingRunId)?.disconnect()
      this.progressSubscriptions.delete(trainingRunId)
      this.progressByRunId.delete(trainingRunId)
    }
  }

  private async ensureProgressSubscription(trainingRunId: number) {
    if (this.progressSubscriptions.has(trainingRunId)) return
    const subscription = new MlTrainingProgressSubscription(
      trainingRunId,
      snapshot => this.onProgress(snapshot),
      () => this.onProgressRejected(trainingRunId),
    )
    this.progressSubscriptions.set(trainingRunId, subscription)
    try {
      await subscription.connect()
    } catch (error) {
      this.progressSubscriptions.delete(trainingRunId)
      throw error
    }
  }

  private onProgress(snapshot: MlTrainingProgressSnapshot) {
    this.progressByRunId.set(snapshot.training_run_id, snapshot)
    this.render()
    if (snapshot.event === "succeeded" || snapshot.event === "failed" || snapshot.event === "cancelled") {
      void this.refresh()
    }
  }

  private onProgressRejected(trainingRunId: number) {
    this.progressSubscriptions.get(trainingRunId)?.disconnect()
    this.progressSubscriptions.delete(trainingRunId)
    this.trainingError = `Training progress subscription rejected for run ${trainingRunId}`
    void this.refresh()
  }

  private disconnectProgressSubscriptions() {
    for (const subscription of this.progressSubscriptions.values()) subscription.disconnect()
    this.progressSubscriptions.clear()
  }

  private field<T extends HTMLInputElement>(name: string): T {
    const field = this.element.querySelector<T>(`[data-field='${name}']`)
    if (!field) throw new Error(`Missing ML models field: ${name}`)
    return field
  }

  private numericField(name: string): number {
    const value = Number(this.field<HTMLInputElement>(name).value)
    if (!Number.isFinite(value) || value < 1) throw new Error(`Invalid numeric training field: ${name}`)
    return value
  }
}
