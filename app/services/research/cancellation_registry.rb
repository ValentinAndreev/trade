# frozen_string_literal: true

module Research
  class CancellationRegistry
    class << self
      def cancel(run_id)
        key = normalize(run_id)
        return if key.nil?

        mutex.synchronize { flags[key] = true }
      end

      def cancelled?(run_id)
        key = normalize(run_id)
        return false if key.nil?

        mutex.synchronize { flags.delete(key) == true }
      end

      def reset! = mutex.synchronize { flags.clear }

      private

      def flags
        @flags ||= {}
      end

      def mutex
        @mutex ||= Mutex.new
      end

      def normalize(run_id)
        value = run_id.to_s.strip
        value.empty? ? nil : value
      end
    end
  end
end
