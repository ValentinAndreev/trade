# frozen_string_literal: true

module Research
  module Systems
    module Schema
      MUTEX = Mutex.new
      private_constant :MUTEX

      module_function

      def data
        MUTEX.synchronize do
          @data ||= begin
            raw = YAML.safe_load(
              File.read(Rails.root.join('config/research/dictionary.yml')),
              aliases: false
            )
            raw['modules'] = { 'types' => module_types_from_config }
            raw['macro_indicators'] = macro_indicators_from_config
            raw
          end
        end
      end

      def reset! = MUTEX.synchronize { @data = nil }

      def module_types_from_config
        macro_keys = MacroConfig.indicator_keys
        module_types = IndicatorsConfig.all.each_with_object({}) do |(key, defn), result|
          params = defn[:params].each_with_object({}) do |(param_key, param), acc|
            schema = param.to_schema
            schema['values'] = macro_keys if param.values == :macro_keys
            acc[param_key.to_s] = schema
          end
          result[key.to_s] = { 'label' => defn[:label], 'params' => params }
            .merge(IndicatorsConfig.schema_metadata_for(key))
        end
        module_types['ml_signal'] = ml_signal_module_type
        module_types
      end

      def ml_signal_module_type
        {
          'label' => 'ML Signal',
          'params' => {
            'model_key' => {
              'type' => 'string',
              'label' => 'Model key',
              'required' => true
            },
            'output' => {
              'type' => 'enum',
              'label' => 'Output',
              'values' => MlPrediction::OUTPUTS,
              'default' => 'probability'
            }
          },
          'output_fields' => [ 'value' ],
          'lookahead' => 0,
          'description' => 'Candle-aligned ML prediction series from the trained model registry.'
        }
      end

      def macro_indicators_from_config
        MacroConfig.all_indicators.each_with_object({}) do |(key, cfg), result|
          result[key.to_s] = { 'label' => cfg[:label], 'category' => cfg[:category].to_s }
        end
      end

      private :module_types_from_config, :ml_signal_module_type, :macro_indicators_from_config
    end
  end
end
