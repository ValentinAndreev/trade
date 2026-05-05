# frozen_string_literal: true

module Ml
  module Adapters
    module Result
      Error = Data.define(:code, :message, :details) do
        def to_h
          {
            code: code.to_s,
            message:,
            details: details || {}
          }
        end
      end

      TrainingResult = Data.define(
        :status, :weights_format, :weights_payload, :metrics, :fitted_metadata,
        :diagnostics, :error
      ) do
        def success? = status == :succeeded
      end

      PredictionBatch = Data.define(:status, :predictions, :error) do
        def success? = status == :succeeded
      end
    end
  end
end
