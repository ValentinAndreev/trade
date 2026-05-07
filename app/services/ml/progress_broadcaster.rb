# frozen_string_literal: true

require 'json'

module Ml
  class ProgressBroadcaster
    NON_TERMINAL_INTERVAL_SECONDS = 1.0
    PROGRESS_PERCENT_DELTA = 1.0
    TERMINAL_STATUSES = %w[succeeded failed cancelled].freeze

    def self.stream_name(training_run_id) = "ml_training:#{training_run_id}"

    def self.safely_broadcast_terminal(event, training_run:, broadcaster: new(training_run:))
      broadcast_terminal_event(event.to_s, broadcaster:, training_run:)
    rescue StandardError => e
      Rails.logger.warn(
        "ML progress broadcast failed event=#{event} training_run_id=#{training_run&.id} " \
        "error_class=#{e.class.name} message=#{e.message}"
      )
      nil
    end

    def self.broadcast_terminal_event(event, broadcaster:, training_run:)
      case event
      when 'succeeded' then broadcaster.succeeded(training_run:)
      when 'failed' then broadcaster.failed(training_run:)
      when 'cancelled' then broadcaster.cancelled(training_run:)
      else raise ArgumentError, "Unsupported ML terminal progress event: #{event}"
      end
    end
    private_class_method :broadcast_terminal_event

    def initialize(training_run: nil, training_run_id: nil, clock: -> { Time.current }, broadcast_adapter: ActionCable.server)
      @training_run = training_run
      @training_run_id = training_run&.id || training_run_id
      @clock = clock
      @broadcast_adapter = broadcast_adapter
      @last_progress_digest = nil
      @last_progress_broadcast_at = nil
      @last_progress_percent = nil
    end

    def active? = training_run_id.present?

    def queued(training_run: nil)
      emit_run(event: 'queued', training_run: training_run || self.training_run)
    end

    def running(training_run: nil, **payload)
      emit_run(event: 'running', training_run: training_run || self.training_run, payload:)
    end

    def progress(training_run: nil, **payload)
      run = training_run || self.training_run
      progress_payload = base_payload(event: 'progress', training_run: run).merge(normalized_progress_payload(payload))
      digest = progress_digest(progress_payload)
      return if digest == last_progress_digest

      now = clock_seconds
      return unless should_broadcast_progress?(progress_payload[:progress_percent], now:)

      broadcast(progress_payload)
      @last_progress_digest = digest
      @last_progress_broadcast_at = now
      @last_progress_percent = progress_payload[:progress_percent]
    end

    def succeeded(training_run: nil)
      emit_run(event: 'succeeded', training_run: training_run || self.training_run)
    end

    def failed(training_run: nil)
      emit_run(event: 'failed', training_run: training_run || self.training_run)
    end

    def cancelled(training_run: nil)
      emit_run(event: 'cancelled', training_run: training_run || self.training_run)
    end

    def terminal(training_run: nil)
      run = training_run || self.training_run
      return unless TERMINAL_STATUSES.include?(run&.status)

      emit_terminal_status(run.status, training_run: run)
    end

    private

    attr_reader :training_run, :training_run_id, :clock, :broadcast_adapter, :last_progress_digest,
      :last_progress_broadcast_at, :last_progress_percent

    def emit_run(event:, training_run:, payload: {})
      broadcast(base_payload(event:, training_run:).merge(normalized_progress_payload(payload)))
    end

    def emit_terminal_status(status, training_run:)
      case status
      when 'succeeded' then succeeded(training_run:)
      when 'failed' then failed(training_run:)
      when 'cancelled' then cancelled(training_run:)
      else raise ArgumentError, "Unsupported ML terminal progress status: #{status}"
      end
    end

    def base_payload(event:, training_run:)
      {
        event:,
        training_run_id: payload_training_run_id(training_run),
        status: training_run&.status,
        model_key: training_run&.ml_model&.key,
        metrics: canonical_metrics_for(training_run),
        error: presence_hash(training_run&.error_metadata),
        duration_ms: training_run&.duration_ms,
        heartbeat_at: iso8601(training_run&.heartbeat_at),
        started_at: iso8601(training_run&.started_at),
        finished_at: iso8601(training_run&.finished_at)
      }.compact
    end

    def normalized_progress_payload(payload)
      normalized = payload.to_h.deep_symbolize_keys
      progress_percent = progress_percent_for(normalized)
      normalized[:progress_percent] = progress_percent if progress_percent
      normalized
    end

    def progress_percent_for(payload)
      explicit = payload[:progress_percent] || payload[:percentage]
      return bounded_percent(explicit) if explicit

      iteration = payload[:iteration]
      max_iterations = payload[:max_iterations]
      return unless iteration && max_iterations.to_f.positive?

      bounded_percent((iteration.to_f / max_iterations.to_f) * 100.0)
    end

    def bounded_percent(value)
      value.to_f.clamp(0.0, 100.0).round(2)
    end

    def should_broadcast_progress?(progress_percent, now:)
      return true unless last_progress_broadcast_at
      return true if progressed_by_one_percent?(progress_percent)

      (now - last_progress_broadcast_at) >= NON_TERMINAL_INTERVAL_SECONDS
    end

    def progressed_by_one_percent?(progress_percent)
      return false unless progress_percent && last_progress_percent

      (progress_percent - last_progress_percent) >= PROGRESS_PERCENT_DELTA
    end

    def broadcast(payload)
      return unless active?

      broadcast_adapter.broadcast(self.class.stream_name(training_run_id), payload.compact)
    end

    def progress_digest(payload)
      JSON.generate(deep_sort(payload.deep_stringify_keys))
    end

    def deep_sort(value)
      case value
      when Hash
        value.sort.to_h { |key, nested| [ key, deep_sort(nested) ] }
      when Array
        value.map { |nested| deep_sort(nested) }
      else
        value
      end
    end

    def clock_seconds
      clock.call.to_f
    end

    def payload_training_run_id(training_run)
      training_run&.id || training_run_id
    end

    def presence_hash(value)
      return if value.nil?

      value.to_h.presence
    end

    def canonical_metrics_for(training_run)
      return unless training_run

      MlTrainingRun.canonical_metrics(training_run.metrics)
    end

    def iso8601(value)
      value&.iso8601
    end
  end
end
