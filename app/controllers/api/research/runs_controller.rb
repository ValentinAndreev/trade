# frozen_string_literal: true

module Api
  module Research
    class RunsController < BaseController
      def create
        result = ::Research::Runs::Execute.new(research_payload).call
        render json: result.payload, status: result.status
      end

      def cancel
        run_id = params[:run_id].to_s
        return render json: { ok: false }, status: :bad_request if run_id.blank?

        ::Research::CancellationRegistry.cancel(run_id)
        render json: { ok: true }
      end

      private

      def research_payload = params.to_unsafe_h.deep_symbolize_keys
    end
  end
end
