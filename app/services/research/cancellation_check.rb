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

    def self.from_proc(callable) = Callable.new(callable)
  end
end
