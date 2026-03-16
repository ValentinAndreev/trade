# frozen_string_literal: true

class Api::ResearchController < Api::ApplicationController
  def run
    request_started_at = monotonic_now
    progress = nil
    research_request = Research::RunRequest.new(research_payload)
    executor = Research::Executor.new(**research_request.executor_config)
    progress = Research::ProgressBroadcaster.new(run_id: research_request.progress_run_id)

    runs = if research_request.optimization_enabled?
      Research::Optimizer.new(
        executor: executor,
        system: research_request.system,
        base_params: research_request.runtime_params
      ).call(
        target: research_request.optimization_target,
        progress: progress,
        **research_request.optimization_range
      )
    else
      progress.started(total_runs: 1, mode: :normal)

      run_started_at = monotonic_now
      run = executor.run(params: research_request.runtime_params)

      progress.run_completed(
        total_runs: 1,
        completed_runs: 1,
        last_run_ms: elapsed_ms(run_started_at),
        elapsed_ms: elapsed_ms(request_started_at)
      )
      progress.finished(total_runs: 1, elapsed_ms: elapsed_ms(request_started_at))

      [ run ]
    end

    total_trades = runs.sum { |run| Array(run[:trades]).length }
    Rails.logger.info(
      "[Research] runs=#{runs.length} total_trades=#{total_trades} " \
      "optimization=#{research_request.optimization_enabled?} " \
      "compute_ms=#{elapsed_ms(request_started_at).round}"
    )

    render json: research_request.response_payload(runs:)
  rescue TechnicalAnalysis::Validation::ValidationError => e
    progress&.failed(message: e.message, elapsed_ms: request_started_at ? elapsed_ms(request_started_at) : nil)
    render json: { error: e.message }, status: :unprocessable_entity
  rescue StandardError => e
    progress&.failed(message: e.message, elapsed_ms: request_started_at ? elapsed_ms(request_started_at) : nil)
    raise
  end

  private

  def monotonic_now
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def elapsed_ms(started_at)
    (monotonic_now - started_at) * 1000.0
  end

  def research_payload
    params.to_unsafe_h.deep_symbolize_keys
  end
end
