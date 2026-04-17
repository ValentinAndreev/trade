# frozen_string_literal: true

module Llm
  class ContextNormalizer
    class << self
      def call(assistant_context)
        context = assistant_context.to_h.deep_symbolize_keys
        raw_linked_target = context[:linked_target].to_h.deep_symbolize_keys
        workspace_snapshot = context[:workspace_snapshot].to_h.deep_symbolize_keys

        normalized_linked_target = raw_linked_target[:type].to_s == 'system_editor' ? {
          type: 'system_editor',
          tab_id: raw_linked_target[:tab_id].to_s.presence,
          system_id: raw_linked_target[:system_id].to_s.presence,
          source_path: raw_linked_target[:source_path].to_s.presence
        } : nil

        {
          host_type: context[:host_type].to_s.presence || 'assistant_tab',
          harness: normalized_linked_target ? 'system_patch' : 'system_design',
          linked_target: normalized_linked_target,
          workspace_snapshot: {
            active_tab_id: workspace_snapshot[:active_tab_id].to_s.presence,
            tabs: Array(workspace_snapshot[:tabs]).map do |tab|
              item = tab.to_h.deep_symbolize_keys
              {
                id: item[:id].to_s,
                type: item[:type].to_s,
                label: item[:label].to_s,
                source_path: item[:source_path].to_s.presence,
                system_id: item[:system_id].to_s.presence
              }
            end
          },
          referenced_tab_ids: Array(context[:referenced_tab_ids]).filter_map { |item| item.to_s.presence },
          editor_context: normalize_editor_context(context[:editor_context] || {})
        }
      end

      private

      def normalize_editor_context(editor_context)
        context = editor_context.to_h.deep_symbolize_keys

        {
          system_id: context[:system_id].to_s.presence,
          source_path: context[:source_path].to_s.presence,
          yaml_hash: context[:yaml_hash].to_s.presence,
          system_yaml: context[:system_yaml].to_s,
          diagnostics: Array(context[:diagnostics]).map do |diagnostic|
            diagnostic.to_h.slice(:message, :line, :column, :length, :code, :path)
          end
        }
      end
    end
  end
end
