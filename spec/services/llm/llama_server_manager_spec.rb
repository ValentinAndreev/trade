# frozen_string_literal: true

require 'rails_helper'
require 'tmpdir'
require 'fileutils'

RSpec.describe Llm::LlamaServerManager do
  let(:user) { create(:user, password: 'password123') }
  let(:tmp_dir) { Dir.mktmpdir('llama-server-manager-spec') }
  let(:model_path) { File.join(tmp_dir, 'model.gguf') }

  before do
    File.write(model_path, 'gguf')
  end

  after do
    FileUtils.remove_entry(tmp_dir) if File.exist?(tmp_dir)
  end

  def write_executable(path)
    File.write(path, "#!/bin/sh\nexit 0\n")
    File.chmod(0o755, path)
  end

  def build_setting(binary_path:, extra_args: '')
    user.llm_settings.create!(
      provider: 'llama',
      model: 'Qwen3.5-9B-Q6_K',
      temperature: 0.2,
      max_output_tokens: 4000,
      launch_config: {
        'binary_path' => binary_path,
        'model_path' => model_path,
        'bind_host' => '0.0.0.0',
        'client_host' => '127.0.0.1',
        'port' => 8080,
        'extra_args' => extra_args
      }
    )
  end

  it 'rejects binaries that are not llama-server' do
    binary_path = File.join(tmp_dir, 'python3')
    write_executable(binary_path)
    setting = build_setting(binary_path:)

    expect { described_class.new(setting).launch! }
      .to raise_error(Llm::Error, 'llama binary must resolve to llama-server')
  end

  it 'rejects symlinked binaries that resolve to another executable' do
    real_binary_path = File.join(tmp_dir, 'python3')
    symlink_path = File.join(tmp_dir, 'llama-server')
    write_executable(real_binary_path)
    File.symlink(real_binary_path, symlink_path)
    setting = build_setting(binary_path: symlink_path)

    expect { described_class.new(setting).launch! }
      .to raise_error(Llm::Error, 'llama binary must resolve to llama-server')
  end

  it 'rejects host and port overrides passed via equals syntax' do
    binary_path = File.join(tmp_dir, 'llama-server')
    write_executable(binary_path)
    setting = build_setting(binary_path:, extra_args: '--port=9090 --host=1.2.3.4')

    expect { described_class.new(setting).launch! }
      .to raise_error(Llm::Error, 'Do not include --port=9090, --host=1.2.3.4 in extra args; use the dedicated fields instead')
  end

  it 'spawns the process, records the pid, and returns started status' do
    binary_path = File.join(tmp_dir, 'llama-server')
    write_executable(binary_path)
    setting = build_setting(binary_path:)

    fake_pid = 99_999
    allow(Process).to receive(:spawn).and_return(fake_pid)
    allow(Process).to receive(:detach)
    allow_any_instance_of(described_class).to receive(:endpoint_reachable?).and_return(false)

    result = described_class.new(setting).launch!

    expect(Process).to have_received(:spawn)
    expect(result[:message]).to eq('llama.cpp server started')
    expect(setting.reload.launch_state['pid']).to eq(fake_pid)
    expect(setting.api_base).to eq('http://127.0.0.1:8080/v1')
  end

  it 'kills the spawned process if the database update fails' do
    binary_path = File.join(tmp_dir, 'llama-server')
    write_executable(binary_path)
    setting = build_setting(binary_path:)

    fake_pid = 99_998
    allow(Process).to receive(:spawn).and_return(fake_pid)
    allow(Process).to receive(:detach)
    allow(Process).to receive(:kill)
    allow_any_instance_of(described_class).to receive(:endpoint_reachable?).and_return(false)
    allow(setting).to receive(:update!).and_raise(ActiveRecord::StatementInvalid, 'db error')

    expect { described_class.new(setting).launch! }.to raise_error(ActiveRecord::StatementInvalid)
    expect(Process).to have_received(:kill).with('TERM', fake_pid)
  end
end
