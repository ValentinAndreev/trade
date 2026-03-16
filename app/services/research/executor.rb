# frozen_string_literal: true

module Research
  class Executor
    private attr_reader :system, :symbol, :timeframe, :start_time, :end_time, :exchange, :fee_bps, :slippage_bps

    def initialize(system:, symbol:, timeframe:, start_time:, end_time:, exchange: 'bitfinex', fee_bps: 0.0, slippage_bps: 0.0)
      @system = system
      @symbol = symbol
      @timeframe = timeframe
      @start_time = start_time
      @end_time = end_time
      @exchange = exchange
      @fee_bps = fee_bps
      @slippage_bps = slippage_bps
      @module_cache = Hash.new { |hash, key| hash[key] = {} }
    end

    def run(params:, mode: :normal, stage: :in_sample)
      normalized_params = params.to_h.symbolize_keys
      module_period = normalized_params.fetch(:module_period).to_i
      rows = rows_for(system.module_key, module_period)

      {
        mode: mode.to_s,
        stage: stage.to_s,
        params: system.run_params(normalized_params),
        trades: Research::BacktestEngine.new(
          rows: rows,
          system: system,
          params: normalized_params,
          fee_bps: fee_bps,
          slippage_bps: slippage_bps
        ).call
      }
    end

    private

    def rows_for(module_key, module_period)
      module_series = cached_module_output(module_key, module_period) do
        module_runner(module_key).call(period: module_period)
      end
      result_by_time = module_series.to_h { |point| [ point[:time], point[:result] ] }

      candles.map do |candle|
        {
          time: candle[:time],
          bar: {
            open: candle[:open],
            high: candle[:high],
            low: candle[:low],
            close: candle[:close],
            volume: candle[:volume]
          },
          result: {
            module_key => result_by_time[candle[:time]] || {}
          }
        }
      end
    end

    def cached_module_output(module_key, cache_key)
      @module_cache[module_key][cache_key] ||= yield
    end

    def module_runner(module_key)
      @module_runners ||= {}
      @module_runners[module_key] ||= Research::ModuleRegistry.fetch(module_key).new(candles: candles)
    end

    def candles
      @candles ||= Candle::FindQuery.new(
        symbol: symbol,
        exchange: exchange,
        timeframe: timeframe,
        start_time: start_time,
        end_time: end_time,
        limit: nil
      ).call
    end
  end
end
