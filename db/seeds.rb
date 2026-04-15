# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).

# Populate the AI model registry from the bundled models.json (no network required).
# To get fresh data from the remote API, run: bundle exec rails ruby_llm:sync_models
RubyLLM.models.load_from_json!
AiModel.save_to_database
puts "Loaded #{AiModel.count} AI models"
