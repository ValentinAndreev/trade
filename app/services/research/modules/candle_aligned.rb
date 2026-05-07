# frozen_string_literal: true

module Research
  module Modules
    class CandleAligned
      def self.depends_on_module_series? = false

      private attr_reader :candles

      def initialize(candles:, **)
        @candles = candles
      end

      def call_from_feature_matrix(cancel_check: nil, **params)
        call(**params, cancel_check:)
      end

      private

      def check_cancelled!(cancel_check)
        cancel_check.check_cancelled! if cancel_check
      end
    end
  end
end
