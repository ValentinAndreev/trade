# frozen_string_literal: true

module Research
  class System
    BAR_FIELDS = %w[open high low close volume].freeze

    private attr_reader :payload, :dictionary

    def initialize(payload, dictionary:)
      @payload    = payload
      @dictionary = dictionary
    end

    def id           = payload['id'].to_s
    def name         = payload['name'].to_s
    def module_type  = payload.dig('module', 'type').to_s
    def module_key   = module_type.to_sym
    def strategy_key = id

    def module_params
      payload.dig('module', 'params').to_h.transform_keys(&:to_s)
    end

    def runtime_params
      @runtime_params ||= begin
        result = { module_period: payload.dig('module', 'params', 'period').to_i }
        (payload['params'] || {}).each { |key, val| result[key.to_sym] = to_numeric(val) }
        result[:position_mode] = result[:position_mode].presence || 'long_short'
        result
      end
    end

    def optimization_targets
      @optimization_targets ||= begin
        targets = Array(payload.dig('optimization', 'targets'))
        targets = [ 'module.period' ] if targets.empty?
        targets.map { |t| { value: t, label: target_label(t) } }
      end
    end

    def default_optimization_target
      optimization_targets.first&.fetch(:value, nil) || 'module.period'
    end

    def metadata
      {
        id: id,
        name: name,
        module: { type: module_type, params: module_params },
        params: runtime_params.except(:module_period),
        conditions: payload['conditions'].keys,
        optimization_targets: optimization_targets
      }
    end

    def run_params(params)
      p = params.to_h.symbolize_keys
      result = {
        system_id: id,
        system_name: name,
        module_type: module_type,
        module_period: p.fetch(:module_period).to_i,
        position_mode: p[:position_mode].presence || 'long_short'
      }
      p.each do |key, val|
        next if %i[module_period position_mode].include?(key)
        result[key] = to_numeric(val)
      end
      result
    end

    def optimization_param_key(target)
      t = target.presence || default_optimization_target
      return :module_period if t == 'module.period'
      return t.delete_prefix('params.').to_sym if t.start_with?('params.')

      raise ArgumentError, "Unsupported optimization target: #{target}"
    end

    def signals_for(prev_row:, row:, params:)
      payload['conditions'].to_h do |key, cond|
        [ key.to_sym, evaluate(cond, prev_row:, row:, params:) ]
      end
    end

    private

    def evaluate(cond, prev_row:, row:, params:)
      l = resolve(cond['left'],  row:, params:)
      r = resolve(cond['right'], row:, params:)
      return false if l.nil? || r.nil?

      case cond['operator']
      when 'gt'  then l > r
      when 'gte' then l >= r
      when 'lt'  then l < r
      when 'lte' then l <= r
      when 'cross_above'
        return false unless prev_row
        pl = resolve(cond['left'],  row: prev_row, params:)
        pr = resolve(cond['right'], row: prev_row, params:)
        pl && pr && pl <= pr && l > r
      when 'cross_below'
        return false unless prev_row
        pl = resolve(cond['left'],  row: prev_row, params:)
        pr = resolve(cond['right'], row: prev_row, params:)
        pl && pr && pl >= pr && l < r
      else
        false
      end
    end

    def resolve(ref, row:, params:)
      s = ref.to_s
      return to_f_or_nil(row.dig(:bar, s.to_sym))                      if BAR_FIELDS.include?(s)
      return to_f_or_nil(row.dig(:result, module_key, :value))          if s == 'module.value'
      return to_f_or_nil(params[s.delete_prefix('params.').to_sym])     if s.start_with?('params.')

      Float(s) rescue nil
    end

    def target_label(target)
      return dictionary.dig('module', 'types', module_type, 'params', 'period', 'label') if target == 'module.period'

      param_key = target.delete_prefix('params.')
      dictionary.dig('params', param_key, 'label') || target
    end

    def to_f_or_nil(value)
      f = Float(value)
      f.finite? ? f : nil
    rescue ArgumentError, TypeError
      nil
    end

    def to_numeric(value)
      Float(value)
    rescue ArgumentError, TypeError
      value
    end
  end
end
