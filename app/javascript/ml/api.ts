import { apiFetch } from "../services/api_fetch"

export interface MlTrainingRunSummary {
  id: number
  status: string
  metrics: Record<string, number | string | boolean | null>
  error_metadata: Record<string, number | string | boolean | null>
  weight_checksum: string | null
  cancellation_requested_at: string | null
  heartbeat_at: string | null
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  created_at: string
  updated_at: string
}

export interface MlTrainingRunPayload extends MlTrainingRunSummary {
  model: {
    id: number
    key: string
    display_name: string
    architecture: string
    prediction_target: string
    serving_status: string
    serving_weight_checksum: string | null
  }
  dataset_spec: Record<string, number | string | boolean | null>
  resolved_feature_spec: Array<Record<string, unknown>>
  hyperparams: Record<string, number | string | boolean | null>
  seed: number
  fitted_metadata: Record<string, number | string | boolean | null>
}

export interface MlTrainingRunCreatePayload {
  model_key: string
  display_name: string
  dataset_spec: {
    symbol: string
    exchange: string
    timeframe: string
    label_horizon: number
  }
  feature_spec: Array<{
    type: string
    params: Record<string, number | string>
  }>
  hyperparams: Record<string, number | string>
}

export interface MlAutocompleteModel {
  id: number
  key: string
  display_name: string
  architecture: string
  prediction_target: string
  serving_status: string
}

export interface MlModelAutocompleteResponse {
  models: MlAutocompleteModel[]
  meta: {
    limit: number
    truncated: boolean
    has_more: boolean
    max_prediction_rows: number
  }
}

export interface MlModelSummary {
  id: number
  key: string
  display_name: string
  architecture: string
  prediction_target: string
  serving_status: string
  metric_summary: Record<string, number | string | boolean | null>
  serving_weight_checksum: string | null
  latest_successful_training_run: MlTrainingRunSummary | null
  latest_failed_training_run: MlTrainingRunSummary | null
  active_training_run: MlTrainingRunSummary | null
}

interface MlApiErrorPayload {
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  }
}

export async function fetchMlModels(signal?: AbortSignal): Promise<MlModelSummary[]> {
  const response = await apiFetch("/api/ml/models", { signal })
  if (!response) throw requestUnavailableError("ML models request failed", signal)
  if (!response.ok) throw new Error(await mlApiErrorMessage(response))

  return await response.json() as MlModelSummary[]
}

export async function createMlTrainingRun(payload: MlTrainingRunCreatePayload): Promise<MlTrainingRunPayload> {
  const response = await apiFetch("/api/ml/training_runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response) throw new Error("ML training run request failed")
  if (!response.ok) throw new Error(await mlApiErrorMessage(response))

  return await response.json() as MlTrainingRunPayload
}

export async function cancelMlTrainingRun(trainingRunId: number): Promise<MlTrainingRunPayload> {
  const response = await apiFetch(`/api/ml/training_runs/${trainingRunId}/cancel`, { method: "POST" })
  if (!response) throw new Error("ML training run cancel request failed")
  if (!response.ok) throw new Error(await mlApiErrorMessage(response))

  return await response.json() as MlTrainingRunPayload
}

export async function fetchMlModelAutocomplete(query: string, limit = 50, signal?: AbortSignal): Promise<MlModelAutocompleteResponse> {
  const url = `/api/ml/models/autocomplete?${new URLSearchParams({ q: query, limit: String(limit) })}`
  const response = await apiFetch(url, { signal })
  if (!response) throw requestUnavailableError("ML model autocomplete request failed", signal)
  if (!response.ok) throw new Error(await mlApiErrorMessage(response))

  return await response.json() as MlModelAutocompleteResponse
}

async function mlApiErrorMessage(response: Response): Promise<string> {
  const fallback = `ML request failed: ${response.status}`
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return (await response.text()) || fallback
  }

  const payload = await response.json() as MlApiErrorPayload
  const message = payload.error.message
  if (!message) throw new Error("Malformed ML API error response: missing error.message")
  return message
}

function requestUnavailableError(message: string, signal?: AbortSignal): Error | DOMException {
  if (signal?.aborted) return new DOMException(message, "AbortError")
  return new Error(message)
}
