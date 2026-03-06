# frozen_string_literal: true

class Candle < ApplicationRecord
  INDEX_FIELDS = %i[symbol exchange ts].freeze

  # Validations
  validates :ts, :symbol, :exchange, :timeframe, presence: true
  validates :open, :high, :low, :close, :volume, presence: true

  # Default ordering
  self.implicit_order_column = 'ts'

  # Scopes
  scope :for_symbol, ->(symbol) { where(symbol: symbol) }
  scope :for_timeframe, ->(tf) { where(timeframe: tf) }
  scope :in_range, ->(from, to) { where(ts: from..to) }
  scope :ordered, -> { order(ts: :asc) }

  class << self
    def max_ts(symbol:, exchange: 'bitfinex')
      cache_key = "candle/max_ts/#{symbol}/#{exchange}"
      Rails.cache.fetch(cache_key, expires_in: 1.minute) do
        where(symbol: symbol, exchange: exchange)
          .order(ts: :desc)
          .limit(1)
          .pick(:ts)
      end
    end

    def min_ts(symbol:, exchange: 'bitfinex')
      cache_key = "candle/min_ts/#{symbol}/#{exchange}"
      Rails.cache.fetch(cache_key, expires_in: 1.hour) do
        unscoped
          .where(symbol: symbol, exchange: exchange)
          .reorder(ts: :asc)
          .limit(1)
          .pick(:ts)
      end
    end

    def import(records, returning: %w[ts])
      insert_all(records, unique_by: INDEX_FIELDS, returning: returning) # rubocop:disable Rails/SkipsModelValidations
    end

    def upsert_recent(records)
      upsert_all(records, unique_by: INDEX_FIELDS, update_only: %i[open high low close volume]) # rubocop:disable Rails/SkipsModelValidations
    end
  end

  def to_ohlcv
    {
      time: ts.to_i,
      open: open.to_f,
      high: high.to_f,
      low: low.to_f,
      close: close.to_f,
      volume: volume.to_f
    }
  end
end
