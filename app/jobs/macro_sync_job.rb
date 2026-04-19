# frozen_string_literal: true

class MacroSyncJob < ApplicationJob
  queue_as :sync

  VALID_FREQUENCIES = %w[hourly daily all].freeze

  def perform(frequency: 'all', backfill: false)
    freq = frequency.to_s
    raise ArgumentError, "Unknown frequency: #{freq}. Valid: #{VALID_FREQUENCIES.join(', ')}" unless VALID_FREQUENCIES.include?(freq)

    entries = case freq
    when 'hourly' then Macro::Catalog.hourly
    when 'daily'  then Macro::Catalog.daily
    else               Macro::Catalog.all
    end

    Macro::Syncer.new(backfill:).call(entries)
  end
end
