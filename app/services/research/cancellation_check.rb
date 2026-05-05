# frozen_string_literal: true

module Research
  class CancellationCheck
    class Callable
      def initialize(callable)
        @callable = callable
      end

      def check_cancelled!
        raise Research::Cancelled if @callable.call
      end
    end

    def self.wrap(cancel_check)
      case cancel_check
      when nil then nil
      when Proc then Callable.new(cancel_check)
      else cancel_check
      end
    end
  end
end
