# frozen_string_literal: true

module Research
  module Runs
    class ProgressSession
      def initialize(run_id:)
        @started_at = monotonic_now
        @broadcaster = Research::ProgressBroadcaster.new(run_id: run_id)
      end

      def started(total_runs:, mode:, target: nil)
        broadcaster.started(total_runs: total_runs, mode: mode, target: target)
      end

      def run_completed(total_runs:, completed_runs:, run_started_at:, current_value: nil)
        broadcaster.run_completed(
          total_runs: total_runs,
          completed_runs: completed_runs,
          current_value: current_value,
          last_run_ms: elapsed_ms(run_started_at),
          elapsed_ms: elapsed_ms(started_at)
        )
      end

      def finished(total_runs:)
        broadcaster.finished(total_runs: total_runs, elapsed_ms: elapsed_ms(started_at))
      end

      def failed(message:, total_runs: nil, completed_runs: nil)
        broadcaster.failed(
          message: message,
          total_runs: total_runs,
          completed_runs: completed_runs,
          elapsed_ms: elapsed_ms(started_at)
        )
      end

      def progress_broadcaster
        broadcaster
      end

      def current_time
        monotonic_now
      end

      def total_elapsed_ms
        elapsed_ms(started_at)
      end

      private

      attr_reader :broadcaster, :started_at

      def monotonic_now
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end

      def elapsed_ms(started_at, finished_at = monotonic_now)
        (finished_at - started_at) * 1000.0
      end
    end
  end
end
