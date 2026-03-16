# frozen_string_literal: true

module Research
  class RunRequest
    attr_reader :system

    def initialize(raw_params)
      @raw_params = raw_params.deep_symbolize_keys
      @system = Research::SystemRegistry.fetch(system_type:, module_type:)
    end

    def executor_config
      {
        system: system,
        symbol: dataset.fetch(:symbol),
        timeframe: dataset.fetch(:timeframe),
        start_time: dataset.fetch(:start_time),
        end_time: dataset.fetch(:end_time),
        exchange: dataset[:exchange].presence || 'bitfinex',
        fee_bps: execution.fetch(:fee_bps, 0),
        slippage_bps: execution.fetch(:slippage_bps, 0)
      }
    end

    def runtime_params
      @runtime_params ||= system.runtime_params(
        system_params: system_payload.fetch(:params),
        module_params: module_payload.fetch(:params)
      )
    end

    def optimization_enabled?
      optimization.fetch(:enabled, false) == true
    end

    def optimization_target
      optimization[:target]
    end

    def optimization_range
      {
        from: optimization.fetch(:from),
        to: optimization.fetch(:to),
        step: optimization.fetch(:step)
      }
    end

    def response_payload(runs:)
      {
        strategy: system.strategy_key,
        system: {
          type: system_type,
          params: system_payload.fetch(:params)
        },
        module: {
          type: module_type,
          params: module_payload.fetch(:params)
        },
        dataset: dataset.except(:exchange),
        optimization: {
          enabled: optimization_enabled?,
          param: optimization_enabled? ? (optimization_target || system.default_optimization_target) : nil,
          from: optimization[:from],
          to: optimization[:to],
          step: optimization[:step]
        },
        runs: runs
      }
    end

    def progress_run_id
      raw_params[:run_id]
    end

    private

    attr_reader :raw_params

    def dataset
      @dataset ||= {
        symbol: raw_params.fetch(:symbol),
        timeframe: raw_params.fetch(:timeframe),
        start_time: raw_params.fetch(:start_time),
        end_time: raw_params.fetch(:end_time),
        exchange: raw_params[:exchange]
      }
    end

    def execution
      @execution ||= slice_hash(raw_params[:execution], :fee_bps, :slippage_bps)
    end

    def optimization
      @optimization ||= slice_hash(raw_params[:optimization], :enabled, :target, :from, :to, :step)
    end

    def system_type
      system_payload.fetch(:type)
    end

    def module_type
      module_payload.fetch(:type)
    end

    def system_payload
      @system_payload ||= extract_typed_payload(:system)
    end

    def module_payload
      @module_payload ||= extract_typed_payload(:module)
    end

    def extract_typed_payload(key)
      payload = raw_params.fetch(key)

      {
        type: payload.fetch(:type),
        params: (payload[:params] || {}).deep_symbolize_keys
      }
    end

    def slice_hash(value, *keys)
      return {} unless value

      value.symbolize_keys.slice(*keys)
    end
  end
end
