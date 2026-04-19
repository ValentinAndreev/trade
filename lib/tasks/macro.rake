# frozen_string_literal: true

namespace :macro do
  desc 'Backfill all macro indicators (initial load)'
  task backfill: :environment do
    puts 'Starting macro backfill...'
    MacroSyncJob.perform_now(backfill: true)
    puts 'Done.'
  end

  desc 'Run incremental macro sync (same as scheduled job)'
  task sync: :environment do
    MacroSyncJob.perform_now
  end
end
