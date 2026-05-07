import { apiFetch } from "../services/api_fetch"
import { columnFieldKey } from "../types/store"
import type { DataColumn, DataConfig, DataTableRow } from "../types/store"

export const ML_PREDICTION_REQUEST_INTERVAL_MS = 300
const ML_PREDICTION_REQUEST_STATE_LIMIT = 64
const ML_PREDICTION_LIMITS_URL = "/api/ml/predictions/limits"

export type MlPredictionColumn = Extract<DataColumn, { type: "ml_prediction" }>

export interface MlPredictionColumnError {
  code: string
  message: string
  details: Record<string, unknown>
}

export interface MlPredictionGridResponse {
  values: Record<string, Record<string, number | string | null>>
  errors: Record<string, MlPredictionColumnError>
  diagnostics: {
    max_prediction_rows: number
    source_window_mismatches_by_column: Record<string, Record<string, unknown>>
  }
}

export interface MlPredictionLoadResult {
  errors: Record<string, MlPredictionColumnError>
  diagnostics: MlPredictionGridResponse["diagnostics"] | null
}

export type MlPredictionColumnStatus = MlPredictionColumnError

interface MlPredictionLimitsResponse {
  max_prediction_rows: number
}

interface MlPredictionLoadOptions {
  signal?: AbortSignal
  requestScope?: string
  debounceMs?: number
}

interface MlPredictionFetchResult extends MlPredictionLoadResult {
  payload: MlPredictionGridResponse | null
}

interface MlPredictionRequestState {
  signature: string
  lastFiredAt: number
  lastAccessedAt: number
  abortController?: AbortController
  promise?: Promise<MlPredictionFetchResult>
  result?: MlPredictionFetchResult
  resultExpiresAt?: number
}

const requestStates = new Map<string, MlPredictionRequestState>()
let mlPredictionMaxRows: number | null = null

export function mlPredictionColumns(config: DataConfig): MlPredictionColumn[] {
  return config.columns.filter((column): column is MlPredictionColumn => column.type === "ml_prediction")
}

export function mlPredictionRequestRows(rows: DataTableRow[], columns: MlPredictionColumn[]): number {
  return rows.length * new Set(columns.map(column => column.modelKey)).size
}

export function mlPredictionSignature(config: DataConfig, rows: DataTableRow[]): string {
  const columns = mlPredictionColumns(config)
  if (!columns.length || !rows.length) return ""

  const startTime = rows[0].time
  const endTime = rows[rows.length - 1].time
  const specs = columns.map(column => `${column.id}:${column.modelKey}:${column.modelOutput}`).sort().join("|")
  return [mlPredictionSymbol(config), config.timeframe, startTime, endTime, specs].join("|")
}

export async function loadMlPredictions(
  config: DataConfig,
  rows: DataTableRow[],
  options: MlPredictionLoadOptions = {},
): Promise<MlPredictionLoadResult> {
  const columns = mlPredictionColumns(config)
  if (!columns.length || !rows.length) return { errors: {}, diagnostics: null }
  mlPredictionSymbol(config)

  const requestedRows = mlPredictionRequestRows(rows, columns)
  const maxPredictionRows = await fetchMlPredictionMaxRows(options.signal)
  if (maxPredictionRows != null && requestedRows > maxPredictionRows) return predictionCapError(columns, requestedRows, maxPredictionRows)

  const result = await fetchMlPredictionResult(config, rows, columns, options)
  if (result.payload) mergeMlPredictionValues(rows, columns, result.payload)
  return { errors: result.errors, diagnostics: result.diagnostics }
}

export function clearMlPredictionMaxRowsCache(): void {
  mlPredictionMaxRows = null
}

async function fetchMlPredictionMaxRows(signal?: AbortSignal): Promise<number | null> {
  if (signal?.aborted) throw abortReason(signal)
  if (mlPredictionMaxRows != null) return mlPredictionMaxRows

  const response = await apiFetch(ML_PREDICTION_LIMITS_URL, { signal }, { silent: true })
  if (!response) {
    if (signal?.aborted) throw abortReason(signal)
    return null
  }
  if (!response.ok) return null

  const payload = await response.json() as MlPredictionLimitsResponse
  mlPredictionMaxRows = payload.max_prediction_rows
  return mlPredictionMaxRows
}

function predictionCapError(
  columns: MlPredictionColumn[],
  requestedRows: number,
  maxPredictionRows: number,
): MlPredictionLoadResult {
  return {
    errors: columns.reduce<Record<string, MlPredictionColumnError>>((errors, column) => {
      errors[column.id] = {
        code: "prediction_cell_cap_exceeded",
        message: `prediction request exceeds ${maxPredictionRows} prediction rows`,
        details: { requested_prediction_rows: requestedRows, max_prediction_rows: maxPredictionRows },
      }
      return errors
    }, {}),
    diagnostics: null,
  }
}

export function mlPredictionColumnStatuses(
  columns: MlPredictionColumn[],
  errors: Record<string, MlPredictionColumnError>,
  diagnostics: MlPredictionGridResponse["diagnostics"] | null,
): Record<string, MlPredictionColumnStatus> {
  const statuses: Record<string, MlPredictionColumnStatus> = { ...errors }
  if (!diagnostics) return statuses

  for (const column of columns) {
    const mismatches = diagnostics.source_window_mismatches_by_column[column.id]
    if (!statuses[column.id] && mismatches && Object.keys(mismatches).length) {
      statuses[column.id] = {
        code: "source_window_mismatch",
        message: "prediction source window does not match the requested serving snapshot",
        details: { source_window_mismatches: mismatches },
      }
    }
  }
  return statuses
}

async function fetchMlPredictionResult(
  config: DataConfig,
  rows: DataTableRow[],
  columns: MlPredictionColumn[],
  options: MlPredictionLoadOptions,
): Promise<MlPredictionFetchResult> {
  const signature = mlPredictionSignature(config, rows)
  const scope = options.requestScope || signature
  const now = Date.now()
  pruneRequestStates(now)
  const state = requestStates.get(scope)
  if (state && state.signature === signature) {
    state.lastAccessedAt = now
    if (state.result && state.resultExpiresAt && state.resultExpiresAt > Date.now()) return state.result
    if (state.promise) return state.promise
  }
  if (state && state.abortController) state.abortController.abort()

  const abortController = linkedAbortController(options.signal)
  const nextState: MlPredictionRequestState = {
    signature,
    lastFiredAt: state ? state.lastFiredAt : 0,
    lastAccessedAt: now,
    abortController,
  }
  nextState.promise = performMlPredictionRequest(config, rows, columns, options, abortController.signal, scope, signature, nextState.lastFiredAt)
  requestStates.set(scope, nextState)
  void nextState.promise.then(result => {
    const current = requestStates.get(scope)
    if (current && current.promise === nextState.promise) {
      current.result = result
      current.resultExpiresAt = Date.now() + ML_PREDICTION_REQUEST_INTERVAL_MS
      delete current.abortController
      delete current.promise
    }
    return result
  }, () => {
    const current = requestStates.get(scope)
    if (current && current.promise === nextState.promise) {
      current.resultExpiresAt = Date.now() + ML_PREDICTION_REQUEST_INTERVAL_MS
      delete current.abortController
      delete current.promise
      delete current.result
    }
  })
  pruneRequestStates()
  return nextState.promise
}

async function performMlPredictionRequest(
  config: DataConfig,
  rows: DataTableRow[],
  columns: MlPredictionColumn[],
  options: MlPredictionLoadOptions,
  signal: AbortSignal,
  scope: string,
  signature: string,
  lastFiredAt: number,
): Promise<MlPredictionFetchResult> {
  const debounceMs = options.debounceMs ?? ML_PREDICTION_REQUEST_INTERVAL_MS
  const delayMs = Math.max(debounceMs, lastFiredAt + ML_PREDICTION_REQUEST_INTERVAL_MS - Date.now())
  await waitForPredictionSlot(delayMs, signal)
  const state = requestStates.get(scope)
  if (state && state.signature === signature) state.lastFiredAt = Date.now()

  const response = await apiFetch("/api/ml/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: mlPredictionSymbol(config),
      timeframe: config.timeframe,
      start_time: new Date(rows[0].time * 1000).toISOString(),
      end_time: new Date(rows[rows.length - 1].time * 1000).toISOString(),
      columns: columns.map(column => ({
        column_id: column.id,
        model_key: column.modelKey,
        model_output: column.modelOutput,
      })),
    }),
    signal,
  })
  if (!response) {
    if (signal.aborted) throw abortReason(signal)
    return {
      payload: null,
      errors: columns.reduce<Record<string, MlPredictionColumnError>>((errors, column) => {
        errors[column.id] = {
          code: "request_failed",
          message: "ML prediction request failed",
          details: { status: null },
        }
        return errors
      }, {}),
      diagnostics: null,
    }
  }

  if (!response.ok) {
    const errorPayload = await response.json() as { error: MlPredictionColumnError }
    return {
      payload: null,
      errors: columns.reduce<Record<string, MlPredictionColumnError>>((errors, column) => {
        errors[column.id] = errorPayload.error
        return errors
      }, {}),
      diagnostics: null,
    }
  }

  const payload = await response.json() as MlPredictionGridResponse
  return { payload, errors: payload.errors, diagnostics: payload.diagnostics }
}

function mlPredictionSymbol(config: DataConfig): string {
  const symbol = config.symbols[0]
  if (!symbol) throw new Error("ML prediction request requires a symbol")
  return symbol
}

function waitForPredictionSlot(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal))
  if (delayMs <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, delayMs)
    if (signal) {
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer)
        reject(abortReason(signal))
      }, { once: true })
    }
  })
}

function linkedAbortController(signal?: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal) {
    if (signal.aborted) controller.abort(abortReason(signal))
    signal.addEventListener("abort", () => controller.abort(abortReason(signal)), { once: true })
  }
  return controller
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("ML prediction request aborted", "AbortError")
}

function pruneRequestStates(now = Date.now()): void {
  for (const [scope, state] of requestStates) {
    if (!state.promise && state.resultExpiresAt && state.resultExpiresAt <= now) requestStates.delete(scope)
  }
  while (requestStates.size > ML_PREDICTION_REQUEST_STATE_LIMIT) {
    const staleEntry = [...requestStates.entries()]
      .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)[0]
    if (!staleEntry) return

    const [staleScope, staleState] = staleEntry
    staleState.abortController?.abort(new DOMException("ML prediction request state evicted", "AbortError"))
    requestStates.delete(staleScope)
  }
}

export function mergeMlPredictionValues(
  rows: DataTableRow[],
  columns: MlPredictionColumn[],
  payload: MlPredictionGridResponse,
): void {
  for (const row of rows) {
    const timestamp = String(row.time)
    for (const column of columns) {
      row[columnFieldKey(column)] = payload.values[column.id]?.[timestamp] ?? null
    }
  }
}
