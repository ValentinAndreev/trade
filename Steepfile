D = Steep::Diagnostic

target :app do
  signature "sig"

  check "app/models/utils/"
  check "app/models/candle/"
  check "app/models/user.rb"
  check "app/models/preset.rb"
  check "app/models/candle.rb"
  check "app/controllers/api/"
  check "app/jobs/"
  check "config/configs/"

  library "pathname"
  library "json"
  library "time"
  library "uri"
  library "digest"
  library "cgi"
  library "net-http"

  configure_code_diagnostics(D::Ruby.lenient)
end
