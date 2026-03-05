source 'https://rubygems.org'

gem 'rails', '~> 8.1.2'
gem 'propshaft'
gem 'pg', '~> 1.1'
gem 'puma', '>= 5.0'
gem 'jsbundling-rails'
gem 'turbo-rails'
gem 'stimulus-rails'
gem 'cssbundling-rails'
gem 'jbuilder'
gem 'tzinfo-data', platforms: %i[windows jruby]
gem 'solid_cache'
gem 'solid_queue'
gem 'solid_cable'
gem 'bootsnap', require: false
gem 'kamal', require: false
gem 'thruster', require: false

# Authentication
gem 'bcrypt', '~> 3.1'

# Configuration
gem 'anyway_config'

# HTTP Client
gem 'httparty'

# Technical Analysis
gem 'technical-analysis'

# Frontend
gem 'view_component'

group :development, :test do
  gem 'debug', platforms: %i[mri windows], require: 'debug/prelude'
  gem 'bundler-audit', require: false
  gem 'brakeman', require: false

  # Code Quality
  gem 'rubocop-rails-omakase', require: false

  # Testing
  gem 'rspec-rails'
  gem 'factory_bot_rails'
  gem 'faker'
  gem 'test-prof'
  gem 'webmock'
end

group :development do
  gem 'web-console'
end
