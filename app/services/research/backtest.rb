# frozen_string_literal: true

module Research
  class Backtest
    MODULES = {
      ema: Research::Modules::Ema,
      rsi: Research::Modules::Rsi
    }.freeze

    Position = Struct.new(:direction, :entry_time, :entry_price, :entry_index, keyword_init: true)

    private attr_reader :system, :symbol, :timeframe, :start_time, :end_time, :exchange, :fee_bps, :slippage_bps

    def initialize(system:, symbol:, timeframe:, start_time:, end_time:, exchange: 'bitfinex', fee_bps: 0.0, slippage_bps: 0.0)
      @system       = system
      @symbol       = symbol
      @timeframe    = timeframe
      @start_time   = start_time
      @end_time     = end_time
      @exchange     = exchange
      @fee_bps      = fee_bps.to_f
      @slippage_bps = slippage_bps.to_f
      @module_cache = {}
    end

    def run(params:, mode: :normal, stage: :in_sample)
      p = params.to_h.symbolize_keys
      {
        mode:   mode.to_s,
        stage:  stage.to_s,
        params: system.run_params(p),
        trades: simulate(rows_for(system.module_runtime_configs(p)), p)
      }
    end

    private

    # --- Data loading ---

    def rows_for(module_configs)
      cache_key = module_configs.sort_by { |module_name, _| module_name.to_s }.map do |module_name, config|
        [ module_name.to_s, config[:type].to_s, config[:params].sort_by { |key, _| key.to_s } ]
      end
      results_by_module = (@module_cache[cache_key] ||= build_results_by_module(module_configs))

      candles.map do |c|
        {
          time:   c[:time],
          bar:    c.slice(:open, :high, :low, :close, :volume),
          result: results_by_module.each_with_object({}) do |(module_name, results_by_time), acc|
            acc[module_name.to_sym] = results_by_time[c[:time]] || {}
          end
        }
      end
    end

    def build_results_by_module(module_configs)
      module_configs.each_with_object({}) do |(module_name, config), acc|
        acc[module_name] = module_runner(config[:type]).call(**config[:params].symbolize_keys)
          .to_h { |pt| [ pt[:time], pt[:result] ] }
      end
    end

    def module_runner(module_type)
      @module_runners ||= {}
      @module_runners[module_type.to_s] ||= begin
        klass = MODULES.fetch(module_type.to_sym) { raise ArgumentError, "Unsupported module: #{module_type}" }
        klass.new(candles:)
      end
    end

    def candles
      @candles ||= Candle::FindQuery.new(
        symbol:, exchange:, timeframe:, start_time:, end_time:, limit: nil
      ).call
    end

    # --- Simulation ---

    def simulate(rows, params)
      return [] if rows.length < 3

      trades        = []
      open_position = nil
      position_mode = params[:position_mode].presence || 'long_short'

      (1...(rows.length - 1)).each do |idx|
        signals    = system.signals_for(prev_row: rows[idx - 1], row: rows[idx], params:)
        fill_open  = rows[idx + 1].dig(:bar, :open).to_f
        fill_time  = rows[idx + 1][:time]
        fill_index = idx + 1

        if open_position&.direction == 'long' && signals[:long_exit]
          trades << close_trade(open_position, fill_time:, fill_price: with_slip(fill_open, :sell), fill_index:)
          open_position = nil
        elsif open_position&.direction == 'short' && signals[:short_exit]
          trades << close_trade(open_position, fill_time:, fill_price: with_slip(fill_open, :buy), fill_index:)
          open_position = nil
        end

        next if open_position

        if signals[:long_entry] && !signals[:short_entry] && position_mode != 'short_only'
          open_position = Position.new(direction: 'long',  entry_time: fill_time, entry_price: with_slip(fill_open, :buy),  entry_index: fill_index)
        elsif signals[:short_entry] && !signals[:long_entry] && position_mode != 'long_only'
          open_position = Position.new(direction: 'short', entry_time: fill_time, entry_price: with_slip(fill_open, :sell), entry_index: fill_index)
        end
      end

      trades << open_trade(open_position, rows) if open_position
      trades.sort_by { |t| t[:entryTime] }
    end

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

    def open_trade(position, rows)
      mark  = rows.last.dig(:bar, :close).to_f
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
  end
end
