# frozen_string_literal: true

module Research
  class ProgressBroadcaster
    def initialize(run_id:)
      @run_id = run_id.to_s.presence
      @terminal_event_sent = false
    end

    def active?
      run_id.present?
    end

    def started(total_runs:, mode:, target: nil)
      broadcast(
        event: 'started',
        total_runs: total_runs,
        completed_runs: 0,
        mode: mode.to_s,
        target: target
      )
    end

    def run_completed(total_runs:, completed_runs:, elapsed_ms:, last_run_ms:, current_value: nil)
      broadcast(
        event: 'progress',
        total_runs: total_runs,
        completed_runs: completed_runs,
        elapsed_ms: elapsed_ms.round,
        last_run_ms: last_run_ms.round,
        current_value: current_value
      )
    end

    def finished(total_runs:, elapsed_ms:)
      return if terminal_event_sent?

      @terminal_event_sent = true
      broadcast(
        event: 'completed',
        total_runs: total_runs,
        completed_runs: total_runs,
        elapsed_ms: elapsed_ms.round
      )
    end

    def cancelled(total_runs:, completed_runs:, elapsed_ms:)
      return if terminal_event_sent?

      @terminal_event_sent = true
      broadcast(
        event: 'cancelled',
        total_runs: total_runs,
        completed_runs: completed_runs,
        elapsed_ms: elapsed_ms.round
      )
    end

    def failed(message:, total_runs: nil, completed_runs: nil, elapsed_ms: nil)
      return if terminal_event_sent?

      @terminal_event_sent = true
      broadcast(
        event: 'failed',
        error: message,
        total_runs: total_runs,
        completed_runs: completed_runs,
        elapsed_ms: elapsed_ms&.round
      )
    end

    private

    attr_reader :run_id

    def terminal_event_sent?
      @terminal_event_sent
    end

    def broadcast(payload)
      return unless active?

      ActionCable.server.broadcast("research:#{run_id}", payload.compact)
    end
  end
end
