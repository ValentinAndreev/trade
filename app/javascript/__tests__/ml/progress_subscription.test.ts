import { describe, it, expect, vi, beforeEach } from "vitest"

const cable = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
  create: vi.fn(),
}))

vi.mock("../../chart/feeds/cable_consumer", () => ({
  consumer: {
    subscriptions: {
      create: cable.create,
    },
  },
}))

import { MlTrainingProgressSubscription } from "../../ml/progress_subscription"

describe("MlTrainingProgressSubscription", () => {
  beforeEach(() => {
    cable.unsubscribe.mockReset()
    cable.create.mockReset()
  })

  it("subscribes to the ML training progress channel and forwards payloads", async () => {
    const onUpdate = vi.fn()
    const onRejected = vi.fn()
    cable.create.mockImplementation((_params, callbacks) => {
      callbacks.connected()
      callbacks.received({
        event: "progress",
        training_run_id: 7,
        status: "running",
        model_key: "btc_direction_v1",
        metrics: {},
        error: {},
        duration_ms: null,
        heartbeat_at: null,
        started_at: null,
        finished_at: null,
        progress_percent: 42,
      })
      return { unsubscribe: cable.unsubscribe }
    })

    const subscription = new MlTrainingProgressSubscription(7, onUpdate, onRejected)
    await subscription.connect()
    subscription.disconnect()

    expect(cable.create.mock.calls[0][0]).toEqual({ channel: "MlTrainingProgressChannel", training_run_id: 7 })
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ training_run_id: 7, progress_percent: 42 }))
    expect(onRejected).not.toHaveBeenCalled()
    expect(cable.unsubscribe).toHaveBeenCalled()
  })

  it("surfaces rejected subscriptions without retry loops", async () => {
    const onRejected = vi.fn()
    const onUpdate = vi.fn()
    cable.create.mockImplementation((_params, callbacks) => {
      callbacks.rejected()
      return { unsubscribe: cable.unsubscribe }
    })

    const subscription = new MlTrainingProgressSubscription(99, onUpdate, onRejected)
    await subscription.connect()

    expect(onRejected).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(cable.create).toHaveBeenCalledTimes(1)
  })
})
