class AppConfig < ApplicationConfig
  attr_config :host,
    port: 3000

  def ssl? = port == 443
end
