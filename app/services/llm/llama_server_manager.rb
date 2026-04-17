# frozen_string_literal: true

require 'fileutils'
require 'shellwords'

module Llm
  class LlamaServerManager
    FORBIDDEN_EXTRA_ARGS = %w[-m --model --host --port].freeze

    class << self
      def build_api_base(config)
        normalized = normalize_config(config)
        "http://#{normalized['client_host']}:#{normalized['port']}/v1"
      end

      def normalize_config(config)
        raw = config.to_h.deep_stringify_keys
        port = raw['port'].to_i

        {
          'binary_path' => raw['binary_path'].presence || LlmConfig.llama_default_binary_path,
          'model_path' => raw['model_path'].to_s,
          'bind_host' => raw['bind_host'].presence || LlmConfig.llama_default_bind_host,
          'client_host' => raw['client_host'].presence || LlmConfig.llama_default_client_host,
          'port' => port.positive? ? port : LlmConfig.llama_default_port,
          'extra_args' => raw['extra_args'].to_s.strip
        }
      end
    end

    def initialize(setting)
      @setting = setting
    end

    def status
      return unsupported_status unless llama_provider?

      config = self.class.normalize_config(setting.launch_config)
      reachable = endpoint_reachable?
      pid = setting.launch_state['pid'].presence&.to_i
      running = pid&.positive? && process_alive?(pid)

      {
        supported: true,
        configured: config['model_path'].present?,
        running:,
        reachable:,
        pid: pid,
        api_base: setting.api_base.presence || self.class.build_api_base(config),
        log_path: setting.launch_state['log_path'].presence,
        started_at: setting.launch_state['started_at'].presence,
        message: status_message(running:, reachable:, config:)
      }
    end

    def launch!
      raise Llm::Error, 'Launch is supported only for llama provider' unless llama_provider?

      config = self.class.normalize_config(setting.launch_config)
      validate_config!(config)

      current_status = status
      return current_status.merge(message: 'llama.cpp server is already running') if current_status[:running]
      return current_status.merge(message: 'Endpoint is already reachable; not starting another server') if current_status[:reachable]

      log_path = next_log_path
      FileUtils.mkdir_p(File.dirname(log_path))
      FileUtils.touch(log_path)

      pid = Process.spawn(*build_command(config), out: log_path, err: log_path, pgroup: true)
      Process.detach(pid)

      begin
        setting.update!(
          api_base: self.class.build_api_base(config),
          launch_state: {
            'pid' => pid,
            'started_at' => Time.current.iso8601,
            'log_path' => log_path
          }
        )
      rescue StandardError
        Process.kill('TERM', pid) rescue nil
        raise
      end

      status.merge(message: 'llama.cpp server started')
    end

    def stop!
      raise Llm::Error, 'Stop is supported only for llama provider' unless llama_provider?

      pid = setting.launch_state['pid'].presence&.to_i
      if pid&.positive? && process_alive?(pid)
        Process.kill('TERM', pid)
        wait_for_exit(pid)
      end

      setting.update!(
        launch_state: setting.launch_state.merge(
          'pid' => nil,
          'stopped_at' => Time.current.iso8601
        )
      )

      status.merge(message: 'llama.cpp server stopped')
    end

    private

    attr_reader :setting

    def llama_provider? = setting.provider.to_s == 'llama'

    def unsupported_status
      {
        supported: false,
        configured: false,
        running: false,
        reachable: false,
        pid: nil,
        api_base: setting.api_base,
        log_path: nil,
        started_at: nil,
        message: 'Launch controls are only available for llama.cpp'
      }
    end

    def validate_config!(config)
      raise Llm::Error, 'llama-server binary path is not configured' if config['binary_path'].blank?
      raise Llm::Error, 'llama model path is not configured' if config['model_path'].blank?

      expanded_binary_path = File.expand_path(config['binary_path'])
      expanded_model_path = File.expand_path(config['model_path'])
      raise Llm::Error, "llama-server binary not found: #{expanded_binary_path}" unless File.exist?(expanded_binary_path)
      raise Llm::Error, "llama-server binary is not executable: #{expanded_binary_path}" unless File.file?(expanded_binary_path) && File.executable?(expanded_binary_path)
      raise Llm::Error, "model file not found: #{expanded_model_path}" unless File.exist?(expanded_model_path)

      real_binary_path = File.realpath(expanded_binary_path)
      allowed_binary_names = Array(LlmConfig.llama_allowed_binary_names)
      actual_binary_names = [ File.basename(expanded_binary_path), File.basename(real_binary_path) ].uniq
      unless actual_binary_names.all? { |name| allowed_binary_names.include?(name) }
        raise Llm::Error, "llama binary must resolve to #{allowed_binary_names.join(', ')}"
      end

      tokens = Shellwords.split(config['extra_args'])
      forbidden = tokens.select do |token|
        FORBIDDEN_EXTRA_ARGS.include?(token) || FORBIDDEN_EXTRA_ARGS.any? { |arg| token.start_with?("#{arg}=") }
      end.uniq
      return if forbidden.empty?

      raise Llm::Error, "Do not include #{forbidden.join(', ')} in extra args; use the dedicated fields instead"
    end

    def build_command(config)
      [
        File.expand_path(config['binary_path']),
        '-m',
        File.expand_path(config['model_path']),
        *Shellwords.split(config['extra_args']),
        '--host',
        config['bind_host'],
        '--port',
        config['port'].to_s
      ]
    end

    def next_log_path
      timestamp = Time.current.strftime('%Y%m%d-%H%M%S')
      Rails.root.join('tmp', 'llm', "llama-#{setting.user_id}-#{timestamp}.log").to_s
    end

    def process_alive?(pid)
      Process.kill(0, pid)
      true
    rescue Errno::ESRCH
      false
    rescue Errno::EPERM
      true
    end

    def wait_for_exit(pid, timeout: 5)
      deadline = Time.current + timeout
      loop do
        break unless process_alive?(pid)
        break if Time.current > deadline

        sleep 0.2
      end
    end

    def endpoint_reachable?
      Llm::EndpointCheck.call(provider: setting.provider, api_base: setting.api_base).fetch(:ok, false)
    end

    def status_message(running:, reachable:, config:)
      return 'llama.cpp server is running and reachable' if running && reachable
      return 'llama.cpp process is running but endpoint is not reachable yet' if running
      return 'Endpoint is reachable, but it was not started by this app' if reachable
      return 'Launch config is incomplete' if config['model_path'].blank?

      'llama.cpp server is not running'
    end
  end
end
