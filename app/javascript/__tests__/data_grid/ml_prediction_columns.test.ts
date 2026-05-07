import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("../../services/api_fetch", () => ({
  apiFetch: vi.fn(),
}))

import { compareNullLast } from "../../data_grid/grid_config"
import { buildColDefs } from "../../data_grid/grid_config"
import {
  clearMlPredictionMaxRowsCache,
  loadMlPredictions,
  mlPredictionColumnStatuses,
  mergeMlPredictionValues,
  mlPredictionRequestRows,
  type MlPredictionColumn,
} from "../../data_grid/ml_predictions"
import { apiFetch } from "../../services/api_fetch"
import { columnFieldKey, type DataConfig, type DataTableRow } from "../../types/store"

function row(time: number): DataTableRow {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 1 }
}

const probabilityColumn: MlPredictionColumn = {
  id: "col-prob",
  label: "Probability",
  type: "ml_prediction",
  modelKey: "btc_direction_v1",
  modelOutput: "probability",
}

const directionColumn: MlPredictionColumn = {
  id: "col-dir",
  label: "Direction",
  type: "ml_prediction",
  modelKey: "btc_direction_v1",
  modelOutput: "direction",
}

function config(columns: MlPredictionColumn[]): DataConfig {
  return {
    symbols: ["BTCUSD"],
    timeframe: "1h",
    columns,
    conditions: [],
    chartLinks: [],
  }
}

const maxPredictionRows = 50_000

function limitsResponse(maxRows = maxPredictionRows): Response {
  return new Response(JSON.stringify({ max_prediction_rows: maxRows }))
}

function predictionCalls() {
  return vi.mocked(apiFetch).mock.calls.filter(([url]) => url === "/api/ml/predictions")
}

describe("ML prediction data-grid columns", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearMlPredictionMaxRowsCache()
  })

  it("uses column id for the internal field key", () => {
    expect(columnFieldKey(probabilityColumn)).toBe("ml_prediction:col-prob")
  })

  it("counts prediction cap rows by distinct model key", () => {
    const rows = [row(1), row(2), row(3)]
    expect(mlPredictionRequestRows(rows, [probabilityColumn, directionColumn])).toBe(3)
    expect(mlPredictionRequestRows(rows, [
      probabilityColumn,
      { ...directionColumn, id: "col-other", modelKey: "eth_direction_v1" },
    ])).toBe(6)
  })

  it("requires a symbol before loading ML prediction columns", async () => {
    await expect(loadMlPredictions({ ...config([probabilityColumn]), symbols: [] }, [row(1)], {
      requestScope: "missing-symbol",
      debounceMs: 0,
    })).rejects.toThrow("ML prediction request requires a symbol")

    expect(apiFetch).not.toHaveBeenCalled()
  })

  it("merges timestamp-keyed prediction values into stable column fields", () => {
    const rows = [row(1000), row(1060)]

    mergeMlPredictionValues(rows, [probabilityColumn, directionColumn], {
      values: {
        "col-prob": { "1000": 0.62 },
        "col-dir": { "1000": "long", "1060": null },
      },
      errors: {},
      diagnostics: { max_prediction_rows: maxPredictionRows, source_window_mismatches_by_column: {} },
    })

    expect(rows[0]["ml_prediction:col-prob"]).toBe(0.62)
    expect(rows[0]["ml_prediction:col-dir"]).toBe("long")
    expect(rows[1]["ml_prediction:col-prob"]).toBeNull()
    expect(rows[1]["ml_prediction:col-dir"]).toBeNull()
  })

  it("fills nulls when a partial server response omits a column values bucket", () => {
    const rows = [row(1000)]

    mergeMlPredictionValues(rows, [probabilityColumn], {
      values: {},
      errors: {
        "col-prob": { code: "unknown_model", message: "Unknown model", details: {} },
      },
      diagnostics: { max_prediction_rows: maxPredictionRows, source_window_mismatches_by_column: {} },
    })

    expect(rows[0]["ml_prediction:col-prob"]).toBeNull()
  })

  it("sends the canonical prediction payload and merges the response", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(limitsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
      values: {
        "col-prob": { "1700000000": 0.74, "1700003600": null },
        "col-dir": { "1700000000": "long", "1700003600": null },
      },
      errors: {},
      diagnostics: { max_prediction_rows: maxPredictionRows, source_window_mismatches_by_column: {} },
    })))
    const rows = [row(1700000000), row(1700003600)]

    const result = await loadMlPredictions(config([probabilityColumn, directionColumn]), rows, {
      requestScope: "canonical-payload",
      debounceMs: 0,
    })

    expect(apiFetch).toHaveBeenCalledTimes(2)
    const [url, options] = vi.mocked(apiFetch).mock.calls[1]
    expect(url).toBe("/api/ml/predictions")
    expect(JSON.parse(options!.body as string)).toEqual({
      symbol: "BTCUSD",
      timeframe: "1h",
      start_time: "2023-11-14T22:13:20.000Z",
      end_time: "2023-11-14T23:13:20.000Z",
      columns: [
        { column_id: "col-prob", model_key: "btc_direction_v1", model_output: "probability" },
        { column_id: "col-dir", model_key: "btc_direction_v1", model_output: "direction" },
      ],
    })
    expect(result.errors).toEqual({})
    expect(rows[0]["ml_prediction:col-prob"]).toBe(0.74)
    expect(rows[0]["ml_prediction:col-dir"]).toBe("long")
  })

  it("returns local column errors before sending over-cap requests", async () => {
    vi.mocked(apiFetch).mockResolvedValue(limitsResponse(2))
    const rows = [row(1), row(2), row(3)]

    const result = await loadMlPredictions(config([probabilityColumn]), rows, {
      requestScope: "over-cap",
      debounceMs: 0,
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/ml/predictions/limits")
    expect(result.errors["col-prob"].code).toBe("prediction_cell_cap_exceeded")
    expect(result.errors["col-prob"].details).toEqual({
      requested_prediction_rows: 3,
      max_prediction_rows: 2,
    })
  })

  it("keeps null values last for ML column sorting", () => {
    const asc = [2, null, 1].sort((a, b) => compareNullLast(a, b, false))
    const desc = [2, null, 1].sort((a, b) => -compareNullLast(a, b, true))

    expect(asc).toEqual([1, 2, null])
    expect(desc).toEqual([2, 1, null])
    expect(compareNullLast(null, undefined)).toBe(0)
  })

  it("maps structured request failures to local column errors", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(limitsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: "grid_prediction_request_in_progress",
          message: "another ML grid prediction request is already running for this session",
          details: { retryable: true },
        },
      }), { status: 429 }))

    const result = await loadMlPredictions(config([probabilityColumn, directionColumn]), [row(1700000000)], {
      requestScope: "request-failure",
      debounceMs: 0,
    })

    expect(result.errors["col-prob"].code).toBe("grid_prediction_request_in_progress")
    expect(result.errors["col-dir"].details).toEqual({ retryable: true })
  })

  it("coalesces duplicate in-flight prediction signatures per request scope", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(limitsResponse())
      .mockResolvedValueOnce(limitsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
      values: { "col-prob": { "1800000000": 0.81 } },
      errors: {},
      diagnostics: { max_prediction_rows: maxPredictionRows, source_window_mismatches_by_column: {} },
    })))
    const firstRows = [row(1800000000)]
    const secondRows = [row(1800000000)]

    await Promise.all([
      loadMlPredictions(config([probabilityColumn]), firstRows, { requestScope: "coalesced", debounceMs: 0 }),
      loadMlPredictions(config([probabilityColumn]), secondRows, { requestScope: "coalesced", debounceMs: 0 }),
    ])

    expect(predictionCalls()).toHaveLength(1)
    expect(firstRows[0]["ml_prediction:col-prob"]).toBe(0.81)
    expect(secondRows[0]["ml_prediction:col-prob"]).toBe(0.81)
  })

  it("clears failed request state so the same scope can retry", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(limitsResponse())
      .mockRejectedValueOnce(new Error("network boom"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        values: { "col-prob": { "1800001800": 0.83 } },
        errors: {},
        diagnostics: { max_prediction_rows: maxPredictionRows, source_window_mismatches_by_column: {} },
      })))

    await expect(loadMlPredictions(config([probabilityColumn]), [row(1800001800)], {
      requestScope: "retry-after-failure",
      debounceMs: 0,
    })).rejects.toThrow("network boom")

    const rows = [row(1800001800)]
    await loadMlPredictions(config([probabilityColumn]), rows, {
      requestScope: "retry-after-failure",
      debounceMs: 0,
    })

    expect(predictionCalls()).toHaveLength(2)
    expect(rows[0]["ml_prediction:col-prob"]).toBe(0.83)
  })

  it("rejects debounced prediction waits when aborted", async () => {
    const controller = new AbortController()
    controller.abort(new DOMException("stale range", "AbortError"))

    await expect(loadMlPredictions(config([probabilityColumn]), [row(1800002400)], {
      requestScope: "aborted-wait",
      debounceMs: 50,
      signal: controller.signal,
    })).rejects.toThrow("stale range")

    expect(apiFetch).not.toHaveBeenCalled()
  })

  it("reuses completed prediction responses for duplicate signatures in one scope", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(limitsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
      values: { "col-prob": { "1800003600": 0.82 } },
      errors: {},
      diagnostics: { max_prediction_rows: maxPredictionRows, source_window_mismatches_by_column: {} },
    })))

    await loadMlPredictions(config([probabilityColumn]), [row(1800003600)], {
      requestScope: "completed-reuse",
      debounceMs: 0,
    })
    const rows = [row(1800003600)]
    await loadMlPredictions(config([probabilityColumn]), rows, {
      requestScope: "completed-reuse",
      debounceMs: 0,
    })

    expect(predictionCalls()).toHaveLength(1)
    expect(rows[0]["ml_prediction:col-prob"]).toBe(0.82)
  })

  it("turns source-window mismatch diagnostics into a visible ML column status", () => {
    const statuses = mlPredictionColumnStatuses([probabilityColumn], {}, {
      max_prediction_rows: maxPredictionRows,
      source_window_mismatches_by_column: {
        "col-prob": { "1700000000": { requested_source_window_checksum: "new" } },
      },
    })

    expect(statuses["col-prob"].code).toBe("source_window_mismatch")
    expect(statuses["col-prob"].details).toEqual({
      source_window_mismatches: { "1700000000": { requested_source_window_checksum: "new" } },
    })
  })

  it("keeps explicit column errors ahead of source-window mismatch diagnostics", () => {
    const statuses = mlPredictionColumnStatuses([probabilityColumn], {
      "col-prob": {
        code: "unknown_model",
        message: "Unknown model",
        details: {},
      },
    }, {
      max_prediction_rows: maxPredictionRows,
      source_window_mismatches_by_column: {
        "col-prob": { "1700000000": { requested_source_window_checksum: "new" } },
      },
    })

    expect(statuses["col-prob"].code).toBe("unknown_model")
  })

  it("marks ML column definitions with local column status", () => {
    const [colDef] = buildColDefs([probabilityColumn], {
      "col-prob": {
        code: "unknown_model",
        message: "Unknown model",
        details: {},
      },
    })

    expect(colDef.headerName).toBe("Probability !")
    expect(colDef.headerTooltip).toBe("Unknown model")
  })
})
