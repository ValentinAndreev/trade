# frozen_string_literal: true

module Ml
  class FeatureDefinitionCompatibility
    Mismatch = Data.define(:index, :code, :message, :details) do
      def to_h
        {
          index:,
          code: code.to_s,
          message:,
          details: details || {}
        }
      end
    end

    def initialize(resolved_feature_spec)
      @resolved_feature_spec = Array(resolved_feature_spec)
    end

    def mismatches
      resolved_feature_spec.each_with_index.filter_map do |entry, index|
        payload = entry.to_h.stringify_keys
        type = payload['type'].presence
        next mismatch(index, :feature_type_missing, 'feature type is missing', payload:) if type.blank?

        metadata_mismatch(index, type, payload, current_metadata(type))
      rescue KeyError
        mismatch(
          index,
          :feature_module_unknown,
          "feature module is no longer registered: #{type}",
          type:
        )
      end
    end

    private

    attr_reader :resolved_feature_spec

    def current_metadata(type)
      IndicatorsConfig.schema_metadata_for(type)
    end

    def metadata_mismatch(index, type, payload, current)
      changed = %w[module_version definition_checksum].filter_map do |field|
        expected = current[field]
        actual = payload[field]
        next if expected.to_s == actual.to_s

        {
          field:,
          expected:,
          actual:
        }
      end
      return if changed.empty?

      mismatch(
        index,
        :feature_definition_stale,
        "feature definition is stale: #{type}",
        type:,
        changed:
      )
    end

    def mismatch(index, code, message, **details)
      Mismatch.new(index:, code:, message:, details:)
    end
  end
end
