# frozen_string_literal: true

class Macro::Catalog
  Entry = Data.define(:key, :source, :label, :category, :frequency, :source_params) do
    def [](key) = source_params[key.to_sym]
  end

  MUTEX = Mutex.new
  private_constant :MUTEX

  def self.all
    _load_if_needed
    @all
  end

  def self.hourly
    _load_if_needed
    @by_frequency[:hourly] || []
  end

  def self.daily
    _load_if_needed
    @by_frequency[:daily] || []
  end

  def self.find(key) = all.find { |e| e.key == key.to_s }

  def self.reset! = @all = @by_frequency = nil

  private_class_method def self._load_if_needed
    return if @all

    MUTEX.synchronize do
      unless @all
        entries = build_entries
        @by_frequency = entries.group_by(&:frequency).freeze
        @all = entries.freeze
      end
    end
  end

  private_class_method def self.build_entries
    MacroConfig.all_indicators.map do |key, cfg|
      Entry.new(
        key: key.to_s,
        source: cfg[:source],
        label: cfg[:label],
        category: cfg[:category],
        frequency: cfg[:frequency],
        source_params: cfg.slice(:ticker, :series_id, :asset, :metric, :formula)
      )
    end
  end
end
