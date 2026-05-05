# frozen_string_literal: true

module Ml
  class PredictionRepository
    MAX_CELLS = 50_000
    DEFAULT_BATCH_SIZE = 1_000
    INSERT_COLUMNS = %i[
      ts
      ml_model_id
      ml_training_run_id
      exchange
      symbol
      timeframe
      weight_checksum
      source_window_checksum
      output
      probability
      direction
      confidence
      created_at
      updated_at
    ].freeze
    GUARDED_UPDATE_COLUMNS = %i[
      ml_training_run_id
      weight_checksum
      source_window_checksum
      output
      probability
      direction
      confidence
      updated_at
    ].freeze

    def initialize(model:, exchange:, symbol:, timeframe:)
      @model = model
      @exchange = exchange.to_s
      @symbol = symbol.to_s
      @timeframe = timeframe.to_s
    end

    def fetch_current(rows:, weight_checksum:)
      row_by_time = complete_rows_by_time(rows)
      return {} if row_by_time.empty?

      predictions = MlPrediction
        .for_identity(ml_model_id: model.id, exchange:, symbol:, timeframe:)
        .where(ts: row_by_time.keys.map { |time| timestamp_for_time(time) }, weight_checksum:)
        .ordered

      predictions.each_with_object({}) do |prediction, result|
        row = row_by_time[prediction.ts.to_i]
        next unless row && prediction.source_window_checksum == row.fetch(:source_window_checksum)

        result[row.fetch(:time).to_i] = prediction
      end
    end

    def missing_complete_rows(rows:, current_by_time:)
      rows.select do |row|
        row.fetch(:complete) &&
          row.fetch(:source_window_checksum).present? &&
          !current_by_time.key?(row.fetch(:time).to_i)
      end
    end

    def upsert_predictions(training_run:, rows:, predictions:, weight_checksum:)
      records = records_for(
        training_run:,
        rows:,
        predictions:,
        weight_checksum:
      )
      guarded_upsert(records)
    end

    def value_for(prediction, output)
      return unless prediction

      value = prediction.public_send(output.to_s)
      value.is_a?(BigDecimal) ? value.to_f : value
    end

    private

    attr_reader :model, :exchange, :symbol, :timeframe

    def complete_rows_by_time(rows)
      rows.each_with_object({}) do |row, result|
        next unless row.fetch(:complete) && row.fetch(:source_window_checksum).present?

        result[row.fetch(:time).to_i] = row
      end
    end

    def records_for(training_run:, rows:, predictions:, weight_checksum:)
      rows.zip(predictions).filter_map do |row, prediction|
        next unless prediction

        {
          ts: timestamp_for_time(row.fetch(:time)),
          ml_model_id: model.id,
          ml_training_run_id: training_run.id,
          exchange:,
          symbol:,
          timeframe:,
          weight_checksum:,
          source_window_checksum: row.fetch(:source_window_checksum),
          output: 'probability',
          probability: prediction_value(prediction, :probability),
          direction: prediction_value(prediction, :direction),
          confidence: prediction_value(prediction, :confidence)
        }
      end
    end

    def prediction_value(prediction, key)
      return prediction.fetch(key) if prediction.key?(key)

      prediction.fetch(key.to_s)
    end

    def guarded_upsert(records)
      return ActiveRecord::Result.new([], []) if records.empty?

      normalized = with_timestamps(records)
      connection.exec_query(guarded_upsert_sql(normalized), 'MlPrediction Guarded Upsert')
    end

    def guarded_upsert_sql(records)
      <<~SQL.squish
        INSERT INTO ml_predictions (#{INSERT_COLUMNS.map { |column| connection.quote_column_name(column) }.join(', ')})
        VALUES #{records.map { |record| values_sql(record) }.join(', ')}
        ON CONFLICT (ml_model_id, exchange, symbol, timeframe, ts)
        DO UPDATE SET #{guarded_update_sql}
        WHERE ml_predictions.ml_training_run_id <= EXCLUDED.ml_training_run_id
      SQL
    end

    def values_sql(record)
      "(#{INSERT_COLUMNS.map { |column| connection.quote(record.fetch(column)) }.join(', ')})"
    end

    def guarded_update_sql
      GUARDED_UPDATE_COLUMNS.map do |column|
        quoted = connection.quote_column_name(column)
        "#{quoted} = EXCLUDED.#{quoted}"
      end.join(', ')
    end

    def with_timestamps(records)
      now = Time.current
      records.map { |record| record.merge(created_at: record[:created_at] || now, updated_at: now) }
    end

    def timestamp_for_time(value)
      value.is_a?(Time) ? value.utc : Time.at(value.to_i).utc
    end

    def connection = ActiveRecord::Base.connection
  end
end
