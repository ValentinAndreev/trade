# frozen_string_literal: true

module AuthHelper
  def sign_in(user)
    post '/api/session', params: { username: user.username, password: 'password123' }
  end
end

RSpec.configure do |config|
  config.include AuthHelper, type: :request
end
