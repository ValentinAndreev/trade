class ApplicationJob < ActiveJob::Base
  retry_on ActiveRecord::Deadlocked

  retry_on Candle::Fetcher::FetchError, wait: :polynomially_longer, attempts: 10

  discard_on ActiveJob::DeserializationError
end
