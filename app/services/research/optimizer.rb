# frozen_string_literal: true

module Research
  class Optimizer
    private attr_reader :backtest, :system, :base_params, :mode, :stage

    def initialize(backtest:, system:, base_params:, mode: :optimization, stage: :in_sample, progress_interval: 1.0)
      @backtest = backtest
      @system = system
      @base_params = base_params.to_h.symbolize_keys
      @mode = mode
      @stage = stage
      @progress_interval = [ progress_interval.to_f, 0.0 ].max
    end

    def call(target:, from:, to:, step:, progress: nil, run_id: nil)
      started_at = monotonic_now
      param_key = system.optimization_param_key(target)
      values = values_for(from:, to:, step:)
      next_progress_at = started_at + progress_interval

      progress&.started(total_runs: values.length, mode: mode, target: target)

      completed_runs = []
      values.each_with_index do |value, index|
        if cancelled?(run_id)
          progress&.cancelled(
            total_runs: values.length,
            completed_runs: index,
            elapsed_ms: elapsed_ms(started_at)
          )
          return completed_runs
        end

        run_started_at = monotonic_now
        result = backtest.run(
          params: base_params.merge(param_key => value),
          mode: mode,
          stage: stage
        )
        completed_runs << result
        now = monotonic_now
        if progress && should_publish_progress?(now, next_progress_at, index, values.length)
          progress.run_completed(
            total_runs: values.length,
            completed_runs: index + 1,
            current_value: value,
            last_run_ms: elapsed_ms(run_started_at, now),
            elapsed_ms: elapsed_ms(started_at, now)
          )
          next_progress_at = now + progress_interval
        end
      end

      progress&.finished(total_runs: values.length, elapsed_ms: elapsed_ms(started_at))
      completed_runs
    rescue StandardError => e
      progress&.failed(message: e.message, total_runs: values&.length, elapsed_ms: elapsed_ms(started_at))
      raise
    end

    private

    attr_reader :progress_interval

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def elapsed_ms(started_at, finished_at = monotonic_now)
      (finished_at - started_at) * 1000.0
    end

    def cancelled?(run_id)
      return false if run_id.blank?

      if Rails.cache.read("research_cancel/#{run_id}")
        Rails.cache.delete("research_cancel/#{run_id}")
        true
      else
        false
      end
    end

    def should_publish_progress?(now, next_progress_at, index, total_runs)
      progress_interval.zero? || now >= next_progress_at || index == total_runs - 1
    end

    def values_for(from:, to:, step:)
      current = from.to_f
      finish = to.to_f
      increment = step.to_f
      integer_values = integer_like?(from) && integer_like?(to) && integer_like?(step)

      raise ArgumentError, 'Optimization step must be greater than 0' if increment <= 0
      raise ArgumentError, 'Optimization range is invalid' if current > finish

      values = []
      while current <= (finish + 1e-9)
        values << (integer_values ? current.round : current.round(6))
        current += increment
      end

      values
    end

    def integer_like?(value)
      value.to_f == value.to_i
    end
  end
end
