# frozen_string_literal: true

module Research
  module Runs
    class Execute
      Result = Struct.new(:payload, :status, keyword_init: true)

      def initialize(raw_params)
        @raw_params = raw_params
        @progress_session = Research::Runs::ProgressSession.new(run_id: raw_params[:run_id])
      end

      def call
        request = Research::RunRequest.new(raw_params)
        request.revalidate!
        backtest = Research::Backtest.new(**request.backtest_config)
        runs = request.optimization_enabled? ? optimized_runs(request, backtest) : single_run(request, backtest)

        log_completion(request, runs)
        Result.new(payload: request.response_payload(runs:), status: :ok)
      rescue Research::Systems::Validation::Error => e
        progress_session.failed(message: e.message)
        Result.new(payload: { error: e.message, diagnostics: e.diagnostics.map(&:to_h) }, status: :unprocessable_entity)
      rescue TechnicalAnalysis::Validation::ValidationError => e
        progress_session.failed(message: e.message)
        Result.new(payload: { error: e.message }, status: :unprocessable_entity)
      rescue Research::Modules::MlSignal::Error => e
        progress_session.failed(message: e.message)
        Result.new(payload: ml_signal_error_payload(e), status: :unprocessable_entity)
      rescue StandardError => e
        progress_session.failed(message: e.message)
        raise
      end

      private

      attr_reader :raw_params, :progress_session

      def optimized_runs(request, backtest)
        Research::Optimizer.new(
          backtest:,
          system: request.system,
          base_params: request.runtime_params
        ).call(
          target: request.optimization_target,
          progress: progress_session.broadcaster,
          run_id: request.progress_run_id,
          **request.optimization_range
        )
      end

      def single_run(request, backtest)
        progress_session.started(total_runs: 1, mode: :normal)
        run_started_at = progress_session.current_time
        run = backtest.run(
          params: request.runtime_params,
          cancel_check: Research::CancellationCheck.from_proc(-> { cancelled?(request.progress_run_id) })
        )
        progress_session.run_completed(total_runs: 1, completed_runs: 1, run_started_at:)
        progress_session.finished(total_runs: 1)
        [ run ]
      rescue Research::Backtest::Cancelled
        progress_session.cancelled(total_runs: 1, completed_runs: 0)
        []
      end

      def log_completion(request, runs)
        total_trades = runs.sum { |run| run[:trades].length }
        Rails.logger.info(
          "[Research] runs=#{runs.length} total_trades=#{total_trades} " \
          "optimization=#{request.optimization_enabled?} " \
          "compute_ms=#{progress_session.total_elapsed_ms.round}"
        )
      end

      def cancelled?(run_id)
        return false if run_id.blank?

        Research::CancellationRegistry.cancelled?(run_id)
      end

      def ml_signal_error_payload(error)
        {
          error: error.message,
          diagnostics: [
            {
              code: error.code.to_s,
              message: error.message,
              details: error.details || {}
            }
          ]
        }
      end
    end
  end
end
