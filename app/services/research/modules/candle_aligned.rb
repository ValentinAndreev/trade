# frozen_string_literal: true

module Research
  module Modules
    class CandleAligned
      private attr_reader :candles

      def initialize(candles:, **)
        @candles = candles
      end

      def call_from_feature_matrix(cancel_check: nil, **params)
        call(**params, cancel_check:)
      end

      private

      def check_cancelled!(cancel_check)
        wrapped = Research::CancellationCheck.wrap(cancel_check)
        wrapped.check_cancelled! if wrapped
      end
    end
  end
end
