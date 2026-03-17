# frozen_string_literal: true

module Research
  class BacktestEngine
    Position = Struct.new(:direction, :entry_time, :entry_price, :entry_index, keyword_init: true)

    private attr_reader :rows, :system, :strategy_params, :fee_bps, :slippage_bps

    def initialize(rows:, system:, params: {}, fee_bps: 0.0, slippage_bps: 0.0)
      @rows = rows
      @system = system
      @strategy_params = params.to_h.symbolize_keys
      @fee_bps = fee_bps.to_f
      @slippage_bps = slippage_bps.to_f
    end

    def call
      return [] if rows.length < 3

      trades = []
      open_position = nil

      (1...(rows.length - 1)).each do |idx|
        prev_row = rows[idx - 1]
        row = rows[idx]
        fill_row = rows[idx + 1]

        signals = system.signals_for(prev_row:, row:, params: strategy_params)
        next if signals.empty?

        fill_time = fill_row[:time]
        fill_open = fill_row.dig(:bar, :open).to_f
        fill_index = idx + 1

        if open_position&.direction == 'long' && signals.fetch(:long_exit, false)
          trades << close_trade(open_position, fill_time:, fill_price: adjusted_price(fill_open, :sell), fill_index:)
          open_position = nil
        elsif open_position&.direction == 'short' && signals.fetch(:short_exit, false)
          trades << close_trade(open_position, fill_time:, fill_price: adjusted_price(fill_open, :buy), fill_index:)
          open_position = nil
        end

        next if open_position

        if signals.fetch(:long_entry, false) && !signals.fetch(:short_entry, false) && allow_entry?(:long)
          open_position = Position.new(
            direction: 'long',
            entry_time: fill_time,
            entry_price: adjusted_price(fill_open, :buy),
            entry_index: fill_index
          )
        elsif signals.fetch(:short_entry, false) && !signals.fetch(:long_entry, false) && allow_entry?(:short)
          open_position = Position.new(
            direction: 'short',
            entry_time: fill_time,
            entry_price: adjusted_price(fill_open, :sell),
            entry_index: fill_index
          )
        end
      end

      trades << open_trade(open_position) if open_position
      trades.sort_by { |trade| trade[:entryTime] }
    end

    private

    def allow_entry?(direction)
      case position_mode
      when 'long_only' then direction == :long
      when 'short_only' then direction == :short
      else true
      end
    end

    def position_mode
      strategy_params[:position_mode].presence || 'long_short'
    end

    def close_trade(position, fill_time:, fill_price:, fill_index:)
      entry_fee = fee_amount(position.entry_price)
      exit_fee = fee_amount(fill_price)

      pnl = if position.direction == 'long'
        fill_price - position.entry_price - entry_fee - exit_fee
      else
        position.entry_price - fill_price - entry_fee - exit_fee
      end

      {
        entryTime: position.entry_time,
        entryPrice: rounded(position.entry_price),
        exitTime: fill_time,
        exitPrice: rounded(fill_price),
        direction: position.direction,
        pnl: rounded(pnl),
        pnlPercent: rounded((pnl / position.entry_price) * 100),
        bars: fill_index - position.entry_index
      }
    end

    def open_trade(position)
      last_close = rows.last.dig(:bar, :close).to_f
      mark_price = if position.direction == 'long'
        adjusted_price(last_close, :sell)
      else
        adjusted_price(last_close, :buy)
      end

      entry_fee = fee_amount(position.entry_price)
      exit_fee = fee_amount(mark_price)
      pnl = if position.direction == 'long'
        mark_price - position.entry_price - entry_fee - exit_fee
      else
        position.entry_price - mark_price - entry_fee - exit_fee
      end

      {
        entryTime: position.entry_time,
        entryPrice: rounded(position.entry_price),
        exitTime: nil,
        exitPrice: nil,
        direction: position.direction,
        pnl: rounded(pnl),
        pnlPercent: rounded((pnl / position.entry_price) * 100),
        bars: nil
      }
    end

    def adjusted_price(base_price, side)
      slip = slippage_bps / 10_000.0
      side == :buy ? base_price * (1 + slip) : base_price * (1 - slip)
    end

    def fee_amount(price)
      price * (fee_bps / 10_000.0)
    end

    def rounded(value)
      value.round(4)
    end
  end
end
