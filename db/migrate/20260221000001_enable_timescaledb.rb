# frozen_string_literal: true

class EnableTimescaledb < ActiveRecord::Migration[8.1]
  def up
    enable_extension "timescaledb" unless extension_enabled?("timescaledb")
  end

  def down
    disable_extension "timescaledb" if extension_enabled?("timescaledb")
  end
end
