# frozen_string_literal: true

class Utils::CoinMetricsClient
  include HTTParty

  BASE_URI = 'https://community-api.coinmetrics.io/v4'
  PAGE_SIZE = 10_000
  MAX_PAGES = 100

  Formula = Data.define(:source_metrics, :callable, :cumulative, :context_builder)

  FORMULAS = {
    'mvrv_z_score' => Formula.new(
      source_metrics: %w[CapMrktCurUSD CapMVRVCur],
      callable: lambda do |row, context|
        market_cap  = ::Utils::CoinMetricsClient.numeric_value(row['CapMrktCurUSD'])
        mvrv        = ::Utils::CoinMetricsClient.numeric_value(row['CapMVRVCur'])
        realized_cap = ::Utils::CoinMetricsClient.divide_values(market_cap, mvrv)
        std_dev     = context.fetch(:market_cap_stats).call(market_cap)
        market_cap && realized_cap && std_dev&.positive? ? (market_cap - realized_cap) / std_dev : nil
      end,
      cumulative: true,
      context_builder: -> { { market_cap_stats: ::Utils::CoinMetricsClient.cumulative_market_cap_stats } }
    ),
    'nupl' => Formula.new(
      source_metrics: %w[CapMVRVCur],
      callable: lambda do |row, _|
        mvrv = ::Utils::CoinMetricsClient.numeric_value(row['CapMVRVCur'])
        mvrv&.positive? ? 1.0 - (1.0 / mvrv) : nil
      end,
      cumulative: false,
      context_builder: nil
    ),
    'realized_price' => Formula.new(
      source_metrics: %w[CapMrktCurUSD CapMVRVCur SplyCur],
      callable: lambda do |row, _|
        realized_cap = ::Utils::CoinMetricsClient.divide_values(row['CapMrktCurUSD'], row['CapMVRVCur'])
        ::Utils::CoinMetricsClient.divide_values(realized_cap, row['SplyCur'])
      end,
      cumulative: false,
      context_builder: nil
    )
  }.freeze

  default_timeout 20

  def fetch_series(asset:, metric:, from: nil)
    return [] if asset.blank? || metric.blank?

    metric_key = metric.to_s
    fetch_metric_rows(asset:, metrics: [ metric_key ], from:).filter_map do |row|
      value = numeric_value(row[metric_key])
      next unless value

      { ts: parse_time(row['time']), value: }
    end
  rescue StandardError => e
    Rails.logger.error("[coin_metrics] fetch #{asset}/#{metric} failed: #{e.message}")
    []
  end

  def fetch_derived_series(asset:, formula:, from: nil)
    return [] if asset.blank? || formula.blank?

    definition = formula_definition(formula)
    metric_keys = definition.source_metrics.map(&:to_s)
    return [] if metric_keys.empty?

    # Cumulative formulas such as MVRV Z-Score need the full past to avoid
    # calculating a different value after an incremental sync.
    source_from = definition.cumulative ? nil : from
    rows = fetch_metric_rows(asset:, metrics: metric_keys, from: source_from)
    records = build_derived_records(rows, definition)
    from ? records.select { |record| record[:ts] >= from.utc } : records
  rescue StandardError => e
    Rails.logger.error("[coin_metrics] fetch #{asset}/#{formula} failed: #{e.message}")
    []
  end

  private

  def fetch_metric_rows(asset:, metrics:, from:)
    rows = []
    page = 0
    url = "#{BASE_URI}/timeseries/asset-metrics"
    query = {
      assets: asset.to_s,
      metrics: metrics.join(','),
      frequency: '1d',
      page_size: PAGE_SIZE,
      paging_from: 'start',
      sort: 'time',
      start_time: from&.utc&.strftime('%Y-%m-%d')
    }.compact

    loop do
      raise "Coin Metrics pagination exceeded #{MAX_PAGES} pages" if (page += 1) > MAX_PAGES

      response = self.class.get(url, query:)
      raise "HTTP #{response.code}" unless response.code == 200

      payload = response.parsed_response || {}
      rows.concat(Array(payload['data']))
      next_url = payload['next_page_url'].presence
      break unless next_url

      url = next_url
      query = {}
    end

    validate_metric_presence!(rows, metrics)
    rows
  end

  def build_derived_records(rows, definition)
    context = formula_context(definition)

    rows.filter_map do |row|
      value = definition.callable.call(row, context)
      next unless value

      { ts: parse_time(row['time']), value: }
    end
  end

  def formula_definition(formula)
    FORMULAS.fetch(formula.to_s) { raise ArgumentError, "Unknown Coin Metrics formula: #{formula}" }
  end

  def formula_context(definition)
    definition.context_builder ? definition.context_builder.call : {}
  end

  def validate_metric_presence!(rows, metrics)
    return if rows.empty?

    present_keys = rows.first&.keys&.map(&:to_s) || []
    missing = metrics.map(&:to_s) - present_keys
    raise "Coin Metrics response missing metrics: #{missing.join(', ')}" if missing.any?
  end

  def self.cumulative_market_cap_stats
    count = 0
    mean = 0.0
    m2 = 0.0

    lambda do |value|
      return unless value

      count += 1
      delta = value - mean
      mean += delta / count
      m2 += delta * (value - mean)

      return if count < 2

      # Population std dev (÷N, not ÷N-1) — matches the published Glassnode/CoinMetrics formula,
      # which standardises over the full history-to-date market-cap distribution.
      Math.sqrt(m2 / count)
    end
  end

  def self.validate_formula!(formula)
    return if FORMULAS.key?(formula.to_s)

    raise ArgumentError, "Unknown Coin Metrics formula: #{formula}. Known: #{FORMULAS.keys.join(', ')}"
  end

  def self.divide_values(numerator, denominator)
    numerator = numeric_value(numerator)
    denominator = numeric_value(denominator)
    return if numerator.nil? || denominator.nil? || denominator.zero?

    numerator / denominator
  end

  def self.numeric_value(value)
    return if value.nil?

    number = Float(value)
    number.finite? ? number : nil
  rescue ArgumentError, TypeError
  end

  delegate :divide_values, :numeric_value, to: :class

  def parse_time(value)
    Time.parse(value.to_s).utc
  rescue ArgumentError, TypeError
    raise ArgumentError, "Invalid Coin Metrics time: #{value.inspect}"
  end
end
