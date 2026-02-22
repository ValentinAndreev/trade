# frozen_string_literal: true

Rails.application.config.after_initialize do
  CandleSyncJob.perform_later if defined?(SolidQueue)
end
