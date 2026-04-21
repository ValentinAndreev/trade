# frozen_string_literal: true

module Research
  class Backtest
    class Cancelled < StandardError; end

    Position = Struct.new(:direction, :entry_time, :entry_price, :entry_index, keyword_init: true)

    private attr_reader :system, :symbol, :timeframe, :start_time, :end_time, :exchange, :fee_bps, :slippage_bps

    def initialize(system:, symbol:, timeframe:, start_time:, end_time:, exchange: 'bitfinex', fee_bps: 0.0, slippage_bps: 0.0)
      @system       = system
      @symbol       = symbol
      @timeframe    = timeframe
      @start_time   = start_time
      @end_time     = end_time
      @exchange     = exchange
      @fee_bps        = fee_bps.to_f
      @slippage_bps   = slippage_bps.to_f
      @module_results_cache = {}
      @module_runners = {}
    end

    def run(params:, mode: :normal, stage: :in_sample, cancel_check: nil)
      cancelled!(cancel_check)
      p = params.to_h.symbolize_keys
      module_series = module_results_for(system.module_runtime_configs(p), cancel_check:)
      cancelled!(cancel_check)
      {
        mode:   mode.to_s,
        stage:  stage.to_s,
        params: system.run_params(p),
        trades: simulate(candles, module_series, p, cancel_check:)
      }
    end

    private

    # --- Data loading ---

    def macro_series_data
      @macro_series_data ||= begin
        keys = system.referenced_macro_keys
        return {} if keys.empty?

        from = start_time || candles.first&.dig(:time)&.then { |t| Time.at(t).utc }
        Macro::FindQuery.new(indicators: keys, from:, to: end_time, gapfill: false).call
      end
    end

    def module_results_for(module_configs, cancel_check: nil)
      module_configs.each_with_object({}) do |(module_name, config), acc|
        cancelled!(cancel_check)
        acc[module_name.to_sym] = cached_module_results(config[:type], config[:params], cancel_check:)
      end
    end

    def cached_module_results(module_type, params, cancel_check: nil)
      cancelled!(cancel_check)
      cache_key = [ module_type.to_s, normalized_module_params(params) ]
      @module_results_cache[cache_key] ||= build_module_results(module_type, params, cancel_check:)
    end

    def build_module_results(module_type, params, cancel_check: nil)
      results = Array.new(candles.length)
      module_runner(module_type).call(**params.symbolize_keys).each_with_index do |point, point_index|
        cancelled!(cancel_check) if (point_index % 128).zero?
        candle_index = candle_index_by_time[point[:time]]
        results[candle_index] = point[:result] if candle_index
      end
      results
    end

    def normalized_module_params(params) = params.to_h.sort_by { |key, _| key.to_s }

    def candle_index_by_time
      @candle_index_by_time ||= candles.each_with_index.to_h { |candle, index| [ candle[:time], index ] }
    end

    def module_runner(module_type) = @module_runners[module_type.to_s] ||= Research::Modules.for(module_type).new(candles:)

    def candles
      @candles ||= Candle::FindQuery.new(
        symbol:, exchange:, timeframe:, start_time:, end_time:, limit: nil
      ).call
    end

    # --- Simulation ---

    def simulate(candles, module_series, params, cancel_check: nil)
      return [] if candles.length < 3

      trades        = []
      open_position = nil
      position_mode = params[:position_mode].presence || 'long_short'
      macro_lookup  = macro_series_data
      prev_row = Research::Runtime::RowCursor.new(candles:, module_series:, macro_lookup:, index: 0)
      row = Research::Runtime::RowCursor.new(candles:, module_series:, macro_lookup:, index: 1)

      (1...(candles.length - 1)).each do |idx|
        cancelled!(cancel_check)
        prev_row.index = idx - 1
        row.index = idx
        fill_open  = candles[idx + 1][:open].to_f
        fill_time  = candles[idx + 1][:time]
        fill_index = idx + 1

        if open_position
          if exit_signal?(open_position, prev_row:, row:, params:)
            trades << close_trade(open_position, fill_time:, fill_price: close_fill_price(open_position.direction, fill_open), fill_index:)
            open_position = nil
          else
            next
          end
        end

        long_entry, short_entry = entry_signals(prev_row:, row:, params:, position_mode:)
        if long_entry && !short_entry && position_mode != 'short_only'
          open_position = Position.new(direction: 'long',  entry_time: fill_time, entry_price: with_slip(fill_open, :buy),  entry_index: fill_index)
        elsif short_entry && !long_entry && position_mode != 'long_only'
          open_position = Position.new(direction: 'short', entry_time: fill_time, entry_price: with_slip(fill_open, :sell), entry_index: fill_index)
        end
      end

      trades << open_trade(open_position, candles) if open_position
      trades.sort_by { |t| t[:entryTime] }
    end

    def exit_signal?(position, prev_row:, row:, params:)
      condition_name = position.direction == 'long' ? :long_exit : :short_exit
      system.signal_for(condition_name, prev_row:, row:, params:)
    end

    def entry_signals(prev_row:, row:, params:, position_mode:)
      long_entry = position_mode == 'short_only' ? false : system.signal_for(:long_entry, prev_row:, row:, params:)
      short_entry = position_mode == 'long_only' ? false : system.signal_for(:short_entry, prev_row:, row:, params:)
      [ long_entry, short_entry ]
    end

    def close_fill_price(direction, fill_open) = direction == 'long' ? with_slip(fill_open, :sell) : with_slip(fill_open, :buy)

    def close_trade(position, fill_time:, fill_price:, fill_index:)
      pnl = calc_pnl(position.direction, position.entry_price, fill_price)
      {
        entryTime:  position.entry_time,
        entryPrice: r(position.entry_price),
        exitTime:   fill_time,
        exitPrice:  r(fill_price),
        direction:  position.direction,
        pnl:        r(pnl),
        pnlPercent: r(pnl / position.entry_price * 100),
        bars:       fill_index - position.entry_index
      }
    end

    def open_trade(position, candles)
      mark  = candles.last[:close].to_f
      price = position.direction == 'long' ? with_slip(mark, :sell) : with_slip(mark, :buy)
      pnl   = calc_pnl(position.direction, position.entry_price, price)
      {
        entryTime:  position.entry_time,
        entryPrice: r(position.entry_price),
        exitTime:   nil,
        exitPrice:  nil,
        direction:  position.direction,
        pnl:        r(pnl),
        pnlPercent: r(pnl / position.entry_price * 100),
        bars:       nil
      }
    end

    def calc_pnl(direction, entry, exit_price)
      fees = fee(entry) + fee(exit_price)
      direction == 'long' ? exit_price - entry - fees : entry - exit_price - fees
    end

    def with_slip(price, side)
      slip = slippage_bps / 10_000.0
      side == :buy ? price * (1 + slip) : price * (1 - slip)
    end

    def fee(price) = price * (fee_bps / 10_000.0)
    def r(value)   = value.round(4)

    def cancelled!(cancel_check)
      raise Cancelled if cancel_check&.call
    end
  end
end
