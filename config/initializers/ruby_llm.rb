# frozen_string_literal: true

RubyLLM.configure do |config|
  # The editor assistant uses per-user runtime contexts for credentials.
  # Leave provider keys unset here unless the app is explicitly configured
  # with global defaults.
  config.use_new_acts_as = true
  config.model_registry_class = 'AiModel'
  config.default_model = nil
end
