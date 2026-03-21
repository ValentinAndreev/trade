# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Research example systems' do
  let(:example_paths) do
    Dir[Rails.root.join('config/research/systems/examples/*.yml')].sort
  end

  it 'keeps all example YAML systems valid' do
    aggregate_failures do
      example_paths.each do |path|
        validation = Research::Dsl::Catalog.validate(File.read(path))

        expect(validation).to be_valid, "#{File.basename(path)} diagnostics: #{validation.diagnostics.map(&:message).join(', ')}"
      end
    end
  end
end
