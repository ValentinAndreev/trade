import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("../../services/api_fetch", () => ({
  apiFetch: vi.fn(),
}))

import { cancelMlTrainingRun, createMlTrainingRun, fetchMlModelAutocomplete, fetchMlModels, type MlModelSummary, type MlTrainingRunSummary } from "../../ml/api"
import { renderMlModelsHTML } from "../../ml/templates"
import { apiFetch } from "../../services/api_fetch"

const failedRun: MlTrainingRunSummary = {
  id: 12,
  status: "failed",
  metrics: {},
  error_metadata: { message: "validation failed" },
  weight_checksum: null,
  cancellation_requested_at: null,
  heartbeat_at: null,
  started_at: "2026-05-01T00:00:00Z",
  finished_at: "2026-05-01T00:01:00Z",
  duration_ms: 60_000,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:01:00Z",
}

const successfulRun: MlTrainingRunSummary = {
  ...failedRun,
  id: 11,
  status: "succeeded",
  error_metadata: {},
  weight_checksum: "abc123",
  started_at: "2026-04-30T00:00:00Z",
  finished_at: "2026-04-30T00:01:00Z",
  created_at: "2026-04-30T00:00:00Z",
  updated_at: "2026-04-30T00:01:00Z",
}

const servingModel: MlModelSummary = {
  id: 1,
  key: "btc_direction_v1",
  display_name: "BTC direction",
  architecture: "baseline",
  prediction_target: "direction",
  serving_status: "trained",
  metric_summary: { accuracy: 0.61 },
  serving_weight_checksum: "abc123456789",
  latest_successful_training_run: successfulRun,
  latest_failed_training_run: failedRun,
  active_training_run: null,
}

describe("ML models UI", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("fetches model summaries through the canonical API payload", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify([{
      ...servingModel,
    }])))

    const models = await fetchMlModels()

    expect(apiFetch).toHaveBeenCalledWith("/api/ml/models", { signal: undefined })
    expect(models[0]).toEqual(servingModel)
  })

  it("renders loading and empty states deterministically", () => {
    expect(renderMlModelsHTML({
      state: "loading",
      models: [],
      errorMessage: null,
      trainingBusy: false,
      trainingError: null,
      progressByRunId: new Map(),
    })).toContain("Loading models")
    expect(renderMlModelsHTML({
      state: "loaded",
      models: [],
      errorMessage: null,
      trainingBusy: false,
      trainingError: null,
      progressByRunId: new Map(),
    })).toContain("No ML models")
  })

  it("renders latest failed retrain while prior weights remain serving", () => {
    const html = renderMlModelsHTML({
      state: "loaded",
      models: [servingModel],
      errorMessage: null,
      trainingBusy: false,
      trainingError: null,
      progressByRunId: new Map(),
    })

    expect(html).toContain("Serving, latest retrain failed")
    expect(html).toContain("validation failed")
    expect(html).not.toContain("weight_blob")
  })

  it("renders blank metric values and truthy error metadata fallbacks", () => {
    const html = renderMlModelsHTML({
      state: "loaded",
      models: [{
        ...servingModel,
        metric_summary: { sharpe: null },
        latest_failed_training_run: { ...failedRun, error_metadata: { message: false, code: "boom" } },
      }],
      errorMessage: null,
      trainingBusy: false,
      trainingError: null,
      progressByRunId: new Map(),
    })

    expect(html).toContain("sharpe:</span> -")
    expect(html).toContain("boom")
    expect(html).not.toContain("null")
  })

  it("renders singular model count and invalid dates without throwing", () => {
    const html = renderMlModelsHTML({
      state: "loaded",
      models: [{ ...servingModel, latest_failed_training_run: { ...failedRun, updated_at: "bad-date" } }],
      errorMessage: null,
      trainingBusy: false,
      trainingError: null,
      progressByRunId: new Map(),
    })

    expect(html).toContain("1 model")
    expect(html).toContain("bad-date")
  })

  it("renders failed load state", () => {
    const html = renderMlModelsHTML({
      state: "failed",
      models: [],
      errorMessage: "ML models failed to load",
      trainingBusy: false,
      trainingError: null,
      progressByRunId: new Map(),
    })

    expect(html).toContain("ML models failed to load")
  })

  it("creates and cancels training runs through the ML training API contract", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, status: "queued" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, status: "cancelled" })))
    const payload = {
      model_key: "btc_direction_v1",
      display_name: "btc_direction_v1",
      dataset_spec: { symbol: "BTCUSD", exchange: "bitfinex", timeframe: "1m", label_horizon: 1 },
      feature_spec: [{ type: "log_return", params: { period: 1 } }],
      hyperparams: { seed: 0, max_iterations: 20 },
    }

    await createMlTrainingRun(payload)
    await cancelMlTrainingRun(7)

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/ml/training_runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/ml/training_runs/7/cancel", { method: "POST" })
  })

  it("uses structured JSON error messages for ML API failures", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
      error: { code: "active_training_run_exists", message: "active training run exists", details: {} },
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }))

    await expect(createMlTrainingRun({
      model_key: "btc_direction_v1",
      display_name: "btc_direction_v1",
      dataset_spec: { symbol: "BTCUSD", exchange: "bitfinex", timeframe: "1m", label_horizon: 1 },
      feature_spec: [{ type: "log_return", params: { period: 1 } }],
      hyperparams: { seed: 0, max_iterations: 20 },
    })).rejects.toThrow("active training run exists")
  })

  it("fails fast when JSON error payloads miss the canonical message", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
      error: { code: "bad_request" },
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }))

    await expect(cancelMlTrainingRun(7)).rejects.toThrow("Malformed ML API error response: missing error.message")
  })

  it("falls back to text for non-JSON ML API errors", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("upstream failed", { status: 502 }))

    await expect(cancelMlTrainingRun(7)).rejects.toThrow("upstream failed")
  })

  it("throws when model list requests return no response", async () => {
    vi.mocked(apiFetch).mockResolvedValue(null)

    await expect(fetchMlModels()).rejects.toThrow("ML models request failed")
  })

  it("fetches capped ML model autocomplete responses", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
      models: [{ id: 1, key: "btc_direction_v1", display_name: "BTC", architecture: "baseline", prediction_target: "direction", serving_status: "trained" }],
      meta: { limit: 50, truncated: false, has_more: false, max_prediction_rows: 50000 },
    })))

    const result = await fetchMlModelAutocomplete("btc", 50)

    const [url] = vi.mocked(apiFetch).mock.calls[0]
    expect(String(url)).toContain("/api/ml/models/autocomplete?q=btc&limit=50")
    expect(result.models[0].key).toBe("btc_direction_v1")
    expect(result.meta.max_prediction_rows).toBe(50000)
  })
})
