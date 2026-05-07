# frozen_string_literal: true

require 'json'

module Ml
  module Adapters
    class BaselineDirectionClassifier
      WEIGHTS_FORMAT = MlModelWeightBlob::BASELINE_FORMAT
      WEIGHTS_SCHEMA_VERSION = 'baseline-direction-classifier-weights:v1'
      DEFAULT_HYPERPARAMS = {
        seed: 0,
        max_iterations: 200,
        tolerance: 0.0001,
        class_weight: 'balanced',
        learning_rate: 0.1
      }.freeze
      DEFAULT_PROGRESS_INTERVAL = 25
      EPSILON = 1e-15
      PARSED_WEIGHTS_CACHE_LIMIT = 16

      def train(examples:, hyperparams: {}, callbacks: nil, feature_names: nil)
        check_cancelled!(callbacks)

        normalized_examples = normalize_examples(examples)
        labels = normalized_examples.map { |example| example.fetch(:label) }
        class_counts = labels.tally
        unless class_counts.key?('up') && class_counts.key?('down')
          return failure(:insufficient_classes, 'training requires at least one up and one down example', class_counts:)
        end

        params = DEFAULT_HYPERPARAMS.merge(hyperparams.to_h.symbolize_keys.slice(*DEFAULT_HYPERPARAMS.keys))
        feature_names = feature_names_for(normalized_examples, feature_names:)
        weights = sample_weights(labels, params.fetch(:class_weight))
        coefficients = Array.new(feature_names.length, 0.0)
        intercept = 0.0
        previous_loss = nil
        iterations = 0

        params.fetch(:max_iterations).to_i.times do |iteration|
          check_cancelled!(callbacks)
          loss, gradients, intercept_gradient = loss_and_gradients(
            normalized_examples, feature_names, coefficients, intercept, weights
          )
          learning_rate = params.fetch(:learning_rate).to_f
          coefficients = coefficients.each_with_index.map { |coefficient, index| coefficient - (learning_rate * gradients[index]) }
          intercept -= learning_rate * intercept_gradient
          iterations = iteration + 1

          report_progress(callbacks, iteration: iterations, max_iterations: params.fetch(:max_iterations).to_i, loss:)
          break if previous_loss && (previous_loss - loss).abs < params.fetch(:tolerance).to_f

          previous_loss = loss
        end

        check_cancelled!(callbacks)
        metrics = metrics_for(normalized_examples, feature_names, coefficients, intercept)
        payload = serialize_weights(
          feature_names:,
          coefficients:,
          intercept:,
          iterations:,
          hyperparams: params.slice(:seed, :max_iterations, :tolerance, :class_weight, :learning_rate)
        )

        Result::TrainingResult.new(
          status: :succeeded,
          weights_format: WEIGHTS_FORMAT,
          weights_payload: payload,
          metrics:,
          fitted_metadata: fitted_metadata(feature_names),
          diagnostics: {
            example_count: normalized_examples.length,
            class_counts: class_counts.stringify_keys,
            iterations:,
            metrics_scope: 'training_set'
          },
          error: nil
        )
      rescue Research::Cancelled
        raise
      rescue StandardError => e
        failure(:adapter_error, e.message)
      end

      def predict(features:, weights:)
        parsed_weights, failure = parsed_weights_for(weights)
        return failure if failure

        feature_names = parsed_weights.fetch('feature_names')
        coefficients = parsed_weights.fetch('coefficients').map(&:to_f)
        intercept = parsed_weights.fetch('intercept').to_f
        predictions = Array(features).map do |feature_payload|
          feature_values = feature_values_for(feature_payload, feature_names)
          if feature_values.any?(&:nil?)
            { probability: nil, direction: nil, confidence: nil }
          else
            probability = sigmoid(intercept + dot(coefficients, feature_values))
            {
              probability:,
              direction: probability >= 0.5 ? 'up' : 'down',
              confidence: ((probability - 0.5).abs * 2.0).round(12)
            }
          end
        end

        Result::PredictionBatch.new(status: :succeeded, predictions:, error: nil)
      end

      private

      def normalize_examples(examples)
        Array(examples).map do |example|
          {
            features: example.fetch(:features).stringify_keys,
            label: example.fetch(:label).to_s
          }
        end
      end

      def feature_names_for(examples, feature_names: nil)
        explicit = Array(feature_names).map(&:to_s)
        return explicit if explicit.any?

        examples.first.fetch(:features).keys
      end

      def sample_weights(labels, class_weight)
        return Array.new(labels.length, 1.0) unless class_weight.to_s == 'balanced'

        counts = labels.tally
        labels.map { |label| labels.length / (2.0 * counts.fetch(label)) }
      end

      def loss_and_gradients(examples, feature_names, coefficients, intercept, sample_weights)
        gradients = Array.new(feature_names.length, 0.0)
        intercept_gradient = 0.0
        loss = 0.0
        denominator = sample_weights.sum

        examples.each_with_index do |example, example_index|
          x = feature_values_for(example.fetch(:features), feature_names)
          y = example.fetch(:label) == 'up' ? 1.0 : 0.0
          probability = sigmoid(intercept + dot(coefficients, x))
          weight = sample_weights[example_index]
          loss += weight * binary_log_loss(y, probability)
          error = probability - y
          gradients.each_index { |index| gradients[index] += weight * error * x[index] }
          intercept_gradient += weight * error
        end

        [
          loss / denominator,
          gradients.map { |gradient| gradient / denominator },
          intercept_gradient / denominator
        ]
      end

      def metrics_for(examples, feature_names, coefficients, intercept)
        scored = examples.map do |example|
          x = feature_values_for(example.fetch(:features), feature_names)
          probability = sigmoid(intercept + dot(coefficients, x))
          { y: example.fetch(:label) == 'up' ? 1.0 : 0.0, probability: }
        end
        labels = scored.map { |entry| entry.fetch(:y) }
        predictions = scored.map { |entry| entry.fetch(:probability) >= 0.5 ? 1.0 : 0.0 }
        counts = labels.tally

        MlTrainingRun.canonical_metrics(
          accuracy: labels.zip(predictions).count { |actual, predicted| actual == predicted } / labels.length.to_f,
          log_loss: scored.sum { |entry| binary_log_loss(entry.fetch(:y), entry.fetch(:probability)) } / scored.length,
          auc: auc(scored),
          baseline_majority: counts.values.max / labels.length.to_f
        )
      end

      def auc(scored)
        positives = scored.count { |entry| entry.fetch(:y) == 1.0 }
        negatives = scored.length - positives
        return if positives.zero? || negatives.zero?

        sorted = scored.sort_by { |entry| entry.fetch(:probability) }
        rank_sum = 0.0
        index = 0
        while index < sorted.length
          tie_end = index
          tie_end += 1 while tie_end + 1 < sorted.length && sorted[tie_end + 1].fetch(:probability) == sorted[index].fetch(:probability)
          average_rank = (index + 1 + tie_end + 1) / 2.0
          (index..tie_end).each { |rank_index| rank_sum += average_rank if sorted[rank_index].fetch(:y) == 1.0 }
          index = tie_end + 1
        end

        (rank_sum - (positives * (positives + 1) / 2.0)) / (positives * negatives)
      end

      def serialize_weights(feature_names:, coefficients:, intercept:, iterations:, hyperparams:)
        JSON.generate(
          {
            schema_version: WEIGHTS_SCHEMA_VERSION,
            weights_format: WEIGHTS_FORMAT,
            feature_names:,
            coefficients: coefficients.map { |value| value.round(15) },
            intercept: intercept.round(15),
            iterations:,
            hyperparams: hyperparams.deep_stringify_keys
          }.deep_stringify_keys.sort.to_h
        )
      end

      def parse_weights(weights)
        payload = JSON.parse(weights)
        unless payload['schema_version'] == WEIGHTS_SCHEMA_VERSION && payload['weights_format'] == WEIGHTS_FORMAT
          return [ nil, prediction_failure(:unsupported_weights_format, 'weights are not baseline_direction_classifier:v1') ]
        end

        [ payload, nil ]
      rescue JSON::ParserError, TypeError => e
        [ nil, prediction_failure(:invalid_weights_payload, e.message) ]
      end

      def parsed_weights_for(weights)
        @parsed_weights_cache ||= {}
        if @parsed_weights_cache.key?(weights)
          cached = @parsed_weights_cache.delete(weights)
          @parsed_weights_cache[weights] = cached
          return cached
        end

        parsed = parse_weights(weights)
        @parsed_weights_cache[weights] = parsed
        @parsed_weights_cache.shift while @parsed_weights_cache.size > PARSED_WEIGHTS_CACHE_LIMIT
        parsed
      end

      def fitted_metadata(feature_names)
        {
          'normalization' => 'module_outputs_no_fit:v1',
          'feature_names' => feature_names,
          'label_mapping' => { 'down' => 0, 'up' => 1 },
          'metrics_scope' => 'training_set'
        }
      end

      def feature_values_for(payload, feature_names)
        features = payload
        feature_names.map do |name|
          value = features.fetch(name)
          value.nil? ? nil : value.to_f
        end
      end

      def dot(coefficients, values)
        coefficients.zip(values).sum { |coefficient, value| coefficient * value }
      end

      def sigmoid(value)
        return 1.0 / (1.0 + Math.exp(-value)) if value >= 0

        exp = Math.exp(value)
        exp / (1.0 + exp)
      end

      def binary_log_loss(actual, probability)
        p = [ [ probability, EPSILON ].max, 1.0 - EPSILON ].min
        -(actual * Math.log(p) + (1.0 - actual) * Math.log(1.0 - p))
      end

      def report_progress(callbacks, iteration:, max_iterations:, loss:)
        return unless (iteration % DEFAULT_PROGRESS_INTERVAL).zero? || iteration == max_iterations

        callbacks&.report_progress(stage: 'training', iteration:, max_iterations:, loss:)
      end

      def check_cancelled!(callbacks)
        callbacks&.check_cancelled!
      end

      def failure(code, message, details = {})
        Result::TrainingResult.new(
          status: :failed,
          weights_format: WEIGHTS_FORMAT,
          weights_payload: nil,
          metrics: MlTrainingRun.canonical_metrics,
          fitted_metadata: {},
          diagnostics: {},
          error: Result::Error.new(code:, message:, details:)
        )
      end

      def prediction_failure(code, message, details = {})
        Result::PredictionBatch.new(
          status: :failed,
          predictions: [],
          error: Result::Error.new(code:, message:, details:)
        )
      end
    end
  end
end
