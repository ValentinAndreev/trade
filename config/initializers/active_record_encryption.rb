# frozen_string_literal: true

require 'digest'

if Rails.env.development? || Rails.env.test?
  secret_key_base = Rails.application.secret_key_base

  derive_key = lambda do |suffix|
    Digest::SHA256.hexdigest("#{secret_key_base}:#{suffix}")[0, 32]
  end

  Rails.application.config.active_record.encryption.primary_key =
    ENV.fetch('ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY', derive_key.call('primary_key'))
  Rails.application.config.active_record.encryption.deterministic_key =
    ENV.fetch('ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY', derive_key.call('deterministic_key'))
  Rails.application.config.active_record.encryption.key_derivation_salt =
    ENV.fetch('ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT', derive_key.call('key_derivation_salt'))
end
