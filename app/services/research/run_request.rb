# frozen_string_literal: true

module Research
  class RunRequest
    attr_reader :system

    def initialize(raw_params)
      @raw_params = raw_params.deep_symbolize_keys
      yaml = requested_yaml
      raise Research::Dsl::ValidationError.new([ Research::Dsl::Diagnostic.yaml_missing ]) if yaml.blank?

      validation = Research::Dsl::Catalog.validate(yaml)
      validation.raise_if_invalid!
      @system = validation.compiled
    end

    def backtest_config
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
      @runtime_params ||= system.runtime_params.deep_symbolize_keys
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
          id: system.id,
          name: system.name,
          params: system.system_params.transform_keys(&:to_s)
        },
        modules: system.modules.transform_values(&:dup),
        dataset: dataset.except(:exchange),
        optimization: optimization_payload,
        runs: runs
      }
    end

    def progress_run_id
      raw_params[:run_id]
    end

    private

    attr_reader :raw_params

    def requested_yaml
      raw_params[:system_yaml].presence || Research::Dsl::Catalog.load_yaml(raw_params[:system_id], relative_path: raw_params[:system_path])
    end

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

    def optimization_payload
      {
        enabled: optimization_enabled?,
        param: optimization_enabled? ? (optimization_target || system.default_optimization_target) : nil,
        from: optimization[:from],
        to: optimization[:to],
        step: optimization[:step]
      }
    end

    def slice_hash(value, *keys)
      return {} unless value

      value.symbolize_keys.slice(*keys)
    end
  end
end
