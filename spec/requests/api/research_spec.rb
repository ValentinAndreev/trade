# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::Research' do
  let(:yaml_system) do
    <<~YAML
      id: price_ema_cross
      name: Price / EMA Cross
      modules:
        ema:
          type: ema
          period: 3
      params:
        position_mode: long_short
      conditions:
        long_entry: "close >> ema.value"
        long_exit: "close << ema.value"
        short_entry: "close << ema.value"
        short_exit: "close >> ema.value"
      optimization:
        targets:
          - ema.period
    YAML
  end

  let(:start_time) { Time.utc(2026, 1, 1, 12, 0) }
  let(:end_time) { start_time + 15.minutes }
  let(:close_values) { [ 100, 101, 102, 101, 99, 97, 98, 100, 103, 104, 102, 99, 96, 97, 100, 104 ] }

  before do
    Rails.cache.clear
    Research::CancellationRegistry.reset!

    close_values.each_with_index do |close, index|
      ts = start_time + index.minutes
      create(
        :candle,
        symbol: 'BTCUSD',
        exchange: 'bitfinex',
        timeframe: '1m',
        ts: ts,
        open: close - 0.5,
        high: close + 1.0,
        low: close - 1.0,
        close: close.to_f,
        volume: 10.0 + index
      )
    end
  end

  describe 'POST /api/research/run' do
    it 'returns the builtin research catalog' do
      get '/api/research/catalog'

      expect(response).to have_http_status(:ok)
      expected_systems = Research::Systems::Catalog.entries.map do |entry|
        {
          'id' => entry.id,
          'file_name' => entry.file_name,
          'relative_path' => entry.relative_path
        }
      end

      expect(
        response.parsed_body.fetch('systems').map { |entry| entry.slice('id', 'file_name', 'relative_path') }
      ).to match_array(expected_systems)
      expect(response.parsed_body.fetch('directories')).to be_a(Array)
    end

    it 'returns editor metadata for highlighting and condition expressions' do
      get '/api/research/editor_metadata'

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json.dig('highlight', 'keywords')).to include('conditions', 'modules')
      expect(json.dig('highlight', 'values')).to include('>>', 'offset')
      expect(json.dig('condition_expression', 'root_requirement')).to eq(
        'Condition expressions must evaluate to a boolean comparison'
      )
      expect(json.dig('condition_expression', 'operators')).to include(
        a_hash_including(
          'symbol' => '>>',
          'category' => 'comparison',
          'register_in_frontend_parser' => true
        )
      )
      expect(json.dig('condition_expression', 'functions')).to include(
        a_hash_including(
          'name' => 'offset',
          'signature' => 'offset(x, n)',
          'positive_integer_literal_indexes' => [ 1 ]
        )
      )
      expect(json.dig('condition_expression', 'references', 'candle_fields')).to include('close')
      expect(json.dig('condition_expression', 'references', 'module_output')).to eq('<module>.value')
      expect(json.dig('condition_expression', 'references', 'params_prefix')).to eq('params.<key>')
    end

    it 'lists files and directories without validating unopened yaml files' do
      Dir.mktmpdir do |dir|
        allow(Research::Systems::Catalog).to receive(:systems_dir).and_return(Pathname.new(dir))
        FileUtils.mkdir_p(File.join(dir, 'examples'))
        File.write(File.join(dir, 'examples', 'price_ema_cross.yml'), yaml_system)
        File.write(File.join(dir, 'my_sysyte.yml'), '')

        get '/api/research/catalog'

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body.fetch('directories')).to include('examples')
        expect(
          response.parsed_body.fetch('systems').map { |entry| entry.fetch('relative_path') }
        ).to match_array([ 'examples/price_ema_cross.yml', 'my_sysyte.yml' ])
      end
    end

    it 'validates yaml systems and returns metadata' do
      post '/api/research/validate', params: {
        system_id: 'price_ema_cross',
        system_yaml: yaml_system
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['ok']).to eq(true)
      expect(json.dig('system', 'modules', 'ema', 'type')).to eq('ema')
      expect(json.dig('system', 'modules', 'ema', 'period')).to eq(3)
      expect(json.dig('system', 'optimization_targets')).to include(
        a_hash_including('value' => 'ema.period')
      )
    end

    it 'saves yaml systems as files' do
      Dir.mktmpdir do |dir|
        allow(Research::Systems::Catalog).to receive(:systems_dir).and_return(Pathname.new(dir))

        post '/api/research/systems/save', params: {
          system_yaml: yaml_system
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body['ok']).to eq(true)
        expect(response.parsed_body.dig('system', 'file_name')).to eq('price_ema_cross.yml')
        expect(File.read(File.join(dir, 'price_ema_cross.yml'))).to eq(yaml_system)
      end
    end

    it 'saves yaml systems into the selected directory' do
      Dir.mktmpdir do |dir|
        allow(Research::Systems::Catalog).to receive(:systems_dir).and_return(Pathname.new(dir))
        FileUtils.mkdir_p(File.join(dir, 'trend'))

        post '/api/research/systems/save', params: {
          directory_path: 'trend',
          system_yaml: yaml_system
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body.dig('system', 'relative_path')).to eq('trend/price_ema_cross.yml')
        expect(File.read(File.join(dir, 'trend/price_ema_cross.yml'))).to eq(yaml_system)
      end
    end

    it 'renames a yaml system file inside its directory and updates root id' do
      Dir.mktmpdir do |dir|
        allow(Research::Systems::Catalog).to receive(:systems_dir).and_return(Pathname.new(dir))
        FileUtils.mkdir_p(File.join(dir, 'trend'))
        File.write(File.join(dir, 'trend/price_ema_cross.yml'), yaml_system)

        post '/api/research/systems/rename', params: {
          source_path: 'trend/price_ema_cross.yml',
          target_system_id: 'price_ema_cross_v2',
          system_yaml: yaml_system
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body['ok']).to eq(true)
        expect(response.parsed_body.dig('system', 'id')).to eq('price_ema_cross_v2')
        expect(response.parsed_body.dig('system', 'file_name')).to eq('price_ema_cross_v2.yml')
        expect(response.parsed_body.dig('system', 'relative_path')).to eq('trend/price_ema_cross_v2.yml')
        expect(File).not_to exist(File.join(dir, 'trend/price_ema_cross.yml'))
        expect(File.read(File.join(dir, 'trend/price_ema_cross_v2.yml'))).to include('id: price_ema_cross_v2')
      end
    end

    it 'deletes a yaml system file' do
      Dir.mktmpdir do |dir|
        allow(Research::Systems::Catalog).to receive(:systems_dir).and_return(Pathname.new(dir))
        FileUtils.mkdir_p(File.join(dir, 'trend'))
        File.write(File.join(dir, 'trend/price_ema_cross.yml'), yaml_system)

        post '/api/research/systems/delete', params: {
          source_path: 'trend/price_ema_cross.yml'
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body['ok']).to eq(true)
        expect(response.parsed_body['deleted_system_path']).to eq('trend/price_ema_cross.yml')
        expect(File).not_to exist(File.join(dir, 'trend/price_ema_cross.yml'))
      end
    end

    it 'creates, renames and deletes directories' do
      Dir.mktmpdir do |dir|
        allow(Research::Systems::Catalog).to receive(:systems_dir).and_return(Pathname.new(dir))

        post '/api/research/directories/create', params: {
          parent_path: nil,
          directory_name: 'trend'
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body['path']).to eq('trend')
        expect(File).to exist(File.join(dir, 'trend'))

        get '/api/research/catalog'
        expect(response.parsed_body.fetch('directories')).to include('trend')

        post '/api/research/directories/rename', params: {
          source_path: 'trend',
          target_name: 'momentum'
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body['path']).to eq('momentum')
        expect(File).to exist(File.join(dir, 'momentum'))
        expect(File).not_to exist(File.join(dir, 'trend'))

        post '/api/research/directories/delete', params: {
          source_path: 'momentum'
        }, as: :json

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body['deleted_path']).to eq('momentum')
        expect(File).not_to exist(File.join(dir, 'momentum'))
      end
    end

    it 'runs a yaml-defined research execution' do
      post '/api/research/run', params: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        system_id: 'price_ema_cross',
        system_yaml: yaml_system,
        execution: { fee_bps: 4, slippage_bps: 2 },
        optimization: { enabled: false }
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['strategy']).to eq('price_ema_cross')
      expect(json.dig('system', 'id')).to eq('price_ema_cross')
      expect(json.dig('system', 'name')).to eq('Price / EMA Cross')
      expect(json.dig('system', 'params')).to eq({
        'position_mode' => 'long_short'
      })
      expect(json['runs']).to have_attributes(length: 1)
      expect(json['runs'].first['params']).to include(
        'system_id' => 'price_ema_cross',
        'system_name' => 'Price / EMA Cross',
        'ema_period' => 3.0
      )
    end

    it 'runs optimization over module period and returns every ema run' do
      post '/api/research/run', params: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        system_id: 'price_ema_cross',
        system_yaml: yaml_system,
        execution: { fee_bps: 4, slippage_bps: 2 },
        optimization: { enabled: true, target: 'ema.period', from: 3, to: 7, step: 2 }
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json.dig('optimization', 'enabled')).to eq(true)
      expect(json.dig('optimization', 'param')).to eq('ema.period')
      expect(json['runs'].length).to eq(3)
      expect(json['runs'].map { |run| run.dig('params', 'ema_period') }).to eq([ 3.0, 5.0, 7.0 ])
    end

    it 'runs RSI threshold research and can optimize lower threshold' do
      rsi_yaml = <<~YAML
        id: rsi_threshold
        name: RSI Threshold Reversal
        modules:
          rsi:
            type: rsi
            period: 3
        params:
          position_mode: long_short
          lower_threshold: 35
          upper_threshold: 65
        conditions:
          long_entry: "rsi.value << params.lower_threshold"
          long_exit: "rsi.value >> params.upper_threshold"
          short_entry: "rsi.value >> params.upper_threshold"
          short_exit: "rsi.value << params.lower_threshold"
        optimization:
          targets:
            - rsi.period
            - params.lower_threshold
            - params.upper_threshold
      YAML

      post '/api/research/run', params: {
        symbol: 'BTCUSD',
        timeframe: '1m',
        start_time: start_time.iso8601,
        end_time: end_time.iso8601,
        system_id: 'rsi_threshold',
        system_yaml: rsi_yaml,
        execution: { fee_bps: 4, slippage_bps: 2 },
        optimization: { enabled: true, target: 'params.lower_threshold', from: 30, to: 40, step: 5 }
      }, as: :json

      expect(response).to have_http_status(:ok)

      json = response.parsed_body
      expect(json['strategy']).to eq('rsi_threshold')
      expect(json.dig('system', 'id')).to eq('rsi_threshold')
      expect(json.dig('system', 'name')).to eq('RSI Threshold Reversal')
      expect(json.dig('optimization', 'param')).to eq('params.lower_threshold')
      expect(json['runs'].map { |run| run.dig('params', 'lower_threshold') }).to eq([ 30.0, 35.0, 40.0 ])
    end

    it 'stores cancellation requests by run id' do
      post '/api/research/cancel', params: { run_id: 'run-123' }, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['ok']).to eq(true)
      expect(Research::CancellationRegistry.cancelled?('run-123')).to eq(true)
    end
  end
end
