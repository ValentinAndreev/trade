import { escapeHTML } from "../utils/dom"
import type { MlTrainingProgressSnapshot } from "./progress_subscription"
import type { MlModelSummary, MlTrainingRunSummary } from "./api"

export type MlModelsViewState = "loading" | "loaded" | "failed"

export interface MlModelsView {
  state: MlModelsViewState
  models: MlModelSummary[]
  errorMessage: string | null
  trainingBusy: boolean
  trainingError: string | null
  progressByRunId: Map<number, MlTrainingProgressSnapshot>
}

export function renderMlModelsHTML(view: MlModelsView): string {
  return `
    <div class="h-full min-h-0 flex flex-col bg-[#0f1117] text-gray-200">
      <div class="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[#2a2a3e]">
        <div class="min-w-0">
          <div class="text-sm uppercase tracking-wide text-gray-500">ML Models</div>
          <div class="text-xs text-gray-500">${modelCountLabel(view)}</div>
        </div>
        <button type="button"
                data-action="click->ml-models#refresh"
                class="px-3 py-1.5 text-sm bg-[#1a1a2e] hover:bg-[#22223a] border border-[#3a3a4e] rounded cursor-pointer">
          Refresh
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-auto">
        ${bodyHTML(view)}
      </div>
    </div>
  `
}

function modelCountLabel(view: MlModelsView): string {
  if (view.state === "loading") return "Loading"
  if (view.state === "failed") return "Unavailable"
  return `${view.models.length} ${view.models.length === 1 ? "model" : "models"}`
}

function bodyHTML(view: MlModelsView): string {
  if (view.state === "loading") {
    return `<div class="h-full flex items-center justify-center text-sm text-gray-500 animate-pulse">Loading models...</div>`
  }
  if (view.state === "failed") {
    return `<div class="h-full flex items-center justify-center text-sm text-red-300">${escapeHTML(view.errorMessage ?? "ML models failed to load")}</div>`
  }
  if (!view.models.length) {
    return `
      <div class="h-full min-h-0 flex flex-col">
        ${trainingFormHTML(view)}
        <div class="flex-1 min-h-[8rem] flex items-center justify-center text-sm text-gray-500">No ML models</div>
      </div>
    `
  }

  return `
    ${trainingFormHTML(view)}
    <table class="w-full text-sm">
      <thead class="sticky top-0 z-10 bg-[#141622] text-xs uppercase tracking-wide text-gray-500 border-b border-[#2a2a3e]">
        <tr>
          <th class="text-left font-medium px-4 py-2">Model</th>
          <th class="text-left font-medium px-3 py-2">Target</th>
          <th class="text-left font-medium px-3 py-2">Serving</th>
          <th class="text-left font-medium px-3 py-2">Training</th>
          <th class="text-left font-medium px-3 py-2">Metrics</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[#22263a]">
        ${view.models.map(model => modelRowHTML(model, view.progressByRunId)).join("")}
      </tbody>
    </table>
  `
}

function trainingFormHTML(view: MlModelsView): string {
  return `
    <form class="grid grid-cols-[minmax(12rem,1fr)_8rem_6rem_6rem_6rem_7rem_auto] gap-2 px-4 py-3 border-b border-[#22263a] bg-[#11131d]"
          data-action="submit->ml-models#createTrainingRun">
      <input data-field="modelKey" required placeholder="model_key" class="px-2 py-1.5 text-sm bg-[#1a1a2e] border border-[#3a3a4e] rounded">
      <input data-field="symbol" required value="BTCUSD" class="px-2 py-1.5 text-sm bg-[#1a1a2e] border border-[#3a3a4e] rounded">
      <input data-field="exchange" required value="bitfinex" class="px-2 py-1.5 text-sm bg-[#1a1a2e] border border-[#3a3a4e] rounded">
      <input data-field="timeframe" required value="1m" class="px-2 py-1.5 text-sm bg-[#1a1a2e] border border-[#3a3a4e] rounded">
      <input data-field="labelHorizon" type="number" min="1" value="1" required class="px-2 py-1.5 text-sm bg-[#1a1a2e] border border-[#3a3a4e] rounded">
      <input data-field="maxIterations" type="number" min="1" value="20" required class="px-2 py-1.5 text-sm bg-[#1a1a2e] border border-[#3a3a4e] rounded">
      <button type="submit"
              ${view.trainingBusy ? "disabled" : ""}
              class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded cursor-pointer">Train</button>
      ${view.trainingError ? `<div class="col-span-7 text-xs text-red-300">${escapeHTML(view.trainingError)}</div>` : ""}
    </form>
  `
}

function modelRowHTML(model: MlModelSummary, progressByRunId: Map<number, MlTrainingProgressSnapshot>): string {
  const status = modelStatus(model)
  return `
    <tr class="hover:bg-[#171a26]">
      <td class="px-4 py-3 align-top">
        <div class="font-medium text-gray-100">${escapeHTML(model.display_name || model.key)}</div>
        <div class="font-mono text-xs text-gray-500">${escapeHTML(model.key)}</div>
        <div class="text-xs text-gray-500">${escapeHTML(model.architecture)}</div>
      </td>
      <td class="px-3 py-3 align-top text-gray-300">${escapeHTML(model.prediction_target)}</td>
      <td class="px-3 py-3 align-top">
        <div class="${status.className}">${escapeHTML(status.label)}</div>
        ${model.serving_weight_checksum ? `<div class="font-mono text-xs text-gray-600">${escapeHTML(model.serving_weight_checksum.slice(0, 12))}</div>` : ""}
      </td>
      <td class="px-3 py-3 align-top">${trainingStateHTML(model, progressByRunId)}</td>
      <td class="px-3 py-3 align-top">${metricSummaryHTML(model.metric_summary)}</td>
    </tr>
  `
}

function modelStatus(model: MlModelSummary): { label: string; className: string } {
  const serving = model.serving_status === "trained" || model.serving_status === "serving"
  if (model.active_training_run) return { label: model.active_training_run.status, className: "text-blue-300" }
  if (model.latest_failed_training_run && serving) {
    return { label: "Serving, latest retrain failed", className: "text-yellow-300" }
  }
  if (serving) return { label: "Serving", className: "text-emerald-300" }
  if (model.latest_failed_training_run) return { label: "Failed", className: "text-red-300" }
  return { label: model.serving_status, className: "text-gray-400" }
}

function trainingStateHTML(model: MlModelSummary, progressByRunId: Map<number, MlTrainingProgressSnapshot>): string {
  if (model.active_training_run) {
    const progress = progressByRunId.get(model.active_training_run.id)
    return `
      ${runSummaryHTML(model.active_training_run, progress)}
      <button type="button"
              data-training-run-id="${model.active_training_run.id}"
              data-action="click->ml-models#cancelTrainingRun"
              class="mt-2 px-2 py-1 text-xs bg-[#2a2a3e] hover:bg-red-500/20 text-red-300 rounded cursor-pointer">Cancel</button>
    `
  }
  if (model.latest_failed_training_run) return runSummaryHTML(model.latest_failed_training_run)
  if (model.latest_successful_training_run) return runSummaryHTML(model.latest_successful_training_run)
  return `<span class="text-gray-500">No runs</span>`
}

function runSummaryHTML(run: MlTrainingRunSummary, progress?: MlTrainingProgressSnapshot): string {
  const progressLine = progress?.progress_percent == null ? "" : `<div class="text-xs text-blue-300">${escapeHTML(String(progress.progress_percent))}%</div>`
  return `
    <div class="text-gray-300">${escapeHTML(run.status)}</div>
    ${progressLine}
    <div class="text-xs text-gray-500">${escapeHTML(formatDate(run.updated_at))}</div>
    ${run.error_metadata && Object.keys(run.error_metadata).length ? `<div class="text-xs text-red-300">${escapeHTML(errorSummary(run.error_metadata))}</div>` : ""}
  `
}

function metricSummaryHTML(metrics: Record<string, number | string | boolean | null>): string {
  const entries = Object.entries(metrics).slice(0, 3)
  if (!entries.length) return `<span class="text-gray-500">-</span>`
  return entries.map(([key, value]) =>
    `<div><span class="text-gray-500">${escapeHTML(key)}:</span> ${escapeHTML(metricValue(value))}</div>`
  ).join("")
}

function errorSummary(errorMetadata: Record<string, number | string | boolean | null>): string {
  const message = errorMetadata.message || Object.values(errorMetadata).find(Boolean) || "Training failed"
  return String(message)
}

function metricValue(value: number | string | boolean | null): string {
  return value == null ? "-" : String(value)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
}
