# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Utils::CoinMetricsClient do
  subject(:client) { described_class.new }

  let(:base_url) { 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics' }

  describe '#fetch_series' do
    it 'fetches a direct Coin Metrics asset metric' do
      stub_request(:get, base_url)
        .with(query: hash_including(
          'assets' => 'btc',
          'metrics' => 'CapMVRVCur',
          'frequency' => '1d',
          'page_size' => '10000'
        ))
        .to_return(
          status: 200,
          body: {
            'data' => [
              { 'asset' => 'btc', 'time' => '2026-04-01T00:00:00.000000000Z', 'CapMVRVCur' => '1.02' },
              { 'asset' => 'btc', 'time' => '2026-04-02T00:00:00.000000000Z', 'CapMVRVCur' => nil }
            ]
          }.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')

      expect(result).to eq([
        { ts: Time.utc(2026, 4, 1), value: 1.02 }
      ])
    end

    it 'follows next_page_url pagination' do
      next_url = "#{base_url}?next_page_token=abc"
      stub_request(:get, base_url)
        .with(query: hash_including('assets' => 'btc', 'metrics' => 'CapMVRVCur'))
        .to_return(
          status: 200,
          body: {
            'data' => [ { 'time' => '2026-04-01T00:00:00Z', 'CapMVRVCur' => '1.01' } ],
            'next_page_url' => next_url
          }.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )
      stub_request(:get, next_url)
        .to_return(
          status: 200,
          body: { 'data' => [ { 'time' => '2026-04-02T00:00:00Z', 'CapMVRVCur' => '1.03' } ] }.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')

      expect(result.map { |point| point[:value] }).to eq([ 1.01, 1.03 ])
    end

    it 'returns [] on HTTP errors' do
      stub_request(:get, base_url)
        .with(query: hash_including('assets' => 'btc', 'metrics' => 'CapMVRVCur'))
        .to_return(status: 429, body: 'rate limited')

      allow(Rails.logger).to receive(:error)

      expect(client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')).to eq([])
    end

    it 'does not return a partial batch when a later page fails' do
      next_url = "#{base_url}?next_page_token=abc"
      stub_request(:get, base_url)
        .with(query: hash_including('assets' => 'btc', 'metrics' => 'CapMVRVCur'))
        .to_return(
          status: 200,
          body: {
            'data' => [ { 'time' => '2026-04-01T00:00:00Z', 'CapMVRVCur' => '1.01' } ],
            'next_page_url' => next_url
          }.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )
      stub_request(:get, next_url).to_return(status: 500, body: 'error')
      allow(Rails.logger).to receive(:error)

      expect(client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')).to eq([])
    end

    it 'stops cyclic pagination' do
      stub_request(:get, %r{\A#{Regexp.escape(base_url)}})
        .to_return do
          {
            status: 200,
            body: {
              'data' => [ { 'time' => '2026-04-01T00:00:00Z', 'CapMVRVCur' => '1.01' } ],
              'next_page_url' => base_url
            }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          }
        end
      allow(Rails.logger).to receive(:error)

      stub_const("#{described_class}::MAX_PAGES", 2)

      expect(client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')).to eq([])
    end

    it 'returns [] when the requested metric is missing from returned rows' do
      stub_request(:get, base_url)
        .with(query: hash_including('assets' => 'btc', 'metrics' => 'CapMVRVCur'))
        .to_return(
          status: 200,
          body: { 'data' => [ { 'time' => '2026-04-01T00:00:00Z' } ] }.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )
      allow(Rails.logger).to receive(:error)

      expect(client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')).to eq([])
      expect(Rails.logger).to have_received(:error).with(/missing metrics: CapMVRVCur/)
    end

    it 'logs an explicit error for invalid timestamps' do
      stub_request(:get, base_url)
        .with(query: hash_including('assets' => 'btc', 'metrics' => 'CapMVRVCur'))
        .to_return(
          status: 200,
          body: { 'data' => [ { 'time' => 'invalid', 'CapMVRVCur' => '1.01' } ] }.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )
      allow(Rails.logger).to receive(:error)

      expect(client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')).to eq([])
      expect(Rails.logger).to have_received(:error).with(/Invalid Coin Metrics time/)
    end

    it 'fetches MVRV Ratio via the direct community metric (CapMVRVCur)' do
      stub_coin_metrics_response(%w[CapMVRVCur], [
        { 'time' => '2026-04-01T00:00:00Z', 'CapMVRVCur' => '2.0' }
      ])

      result = client.fetch_series(asset: 'btc', metric: 'CapMVRVCur')

      expect(result).to eq([ { ts: Time.utc(2026, 4, 1), value: 2.0 } ])
    end
  end

  describe '#fetch_derived_series' do
    it 'calculates realized price from market cap, MVRV, and supply' do
      stub_coin_metrics_response(%w[CapMrktCurUSD CapMVRVCur SplyCur], [
        { 'time' => '2026-04-01T00:00:00Z', 'CapMrktCurUSD' => '2000000', 'CapMVRVCur' => '2.0', 'SplyCur' => '100' }
      ])

      result = client.fetch_derived_series(
        asset: 'btc',
        formula: 'realized_price'
      )

      expect(result).to eq([ { ts: Time.utc(2026, 4, 1), value: 10_000.0 } ])
    end

    it 'calculates NUPL from MVRV' do
      stub_coin_metrics_response(%w[CapMVRVCur], [
        { 'time' => '2026-04-01T00:00:00Z', 'CapMVRVCur' => '2.5' }
      ])

      result = client.fetch_derived_series(
        asset: 'btc',
        formula: 'nupl'
      )

      expect(result).to eq([ { ts: Time.utc(2026, 4, 1), value: 0.6 } ])
    end

    it 'skips NUPL rows where mvrv is zero or negative' do
      stub_coin_metrics_response(%w[CapMVRVCur], [
        { 'time' => '2026-04-01T00:00:00Z', 'CapMVRVCur' => '0.0' },
        { 'time' => '2026-04-02T00:00:00Z', 'CapMVRVCur' => '-1.5' },
        { 'time' => '2026-04-03T00:00:00Z', 'CapMVRVCur' => '2.0' }
      ])

      result = client.fetch_derived_series(asset: 'btc', formula: 'nupl')

      expect(result.length).to eq(1)
      expect(result.first).to eq({ ts: Time.utc(2026, 4, 3), value: 0.5 })
    end

    it 'calculates MVRV Z-Score with cumulative market-cap standard deviation' do
      stub_coin_metrics_response(%w[CapMrktCurUSD CapMVRVCur], [
        { 'time' => '2026-04-01T00:00:00Z', 'CapMrktCurUSD' => '100', 'CapMVRVCur' => '1.25' },
        { 'time' => '2026-04-02T00:00:00Z', 'CapMrktCurUSD' => '200', 'CapMVRVCur' => '2.0' },
        { 'time' => '2026-04-03T00:00:00Z', 'CapMrktCurUSD' => '300', 'CapMVRVCur' => '2.5' }
      ])

      result = client.fetch_derived_series(
        asset: 'btc',
        formula: 'mvrv_z_score',
        from: Time.utc(2026, 4, 3)
      )

      expect(result.length).to eq(1)
      expect(result.first[:ts]).to eq(Time.utc(2026, 4, 3))
      expect(result.first[:value]).to be_within(0.0001).of(2.2045)
    end
  end

  def stub_coin_metrics_response(metrics, rows)
    stub_request(:get, base_url)
      .with(query: hash_including(
        'assets' => 'btc',
        'metrics' => metrics.join(','),
        'frequency' => '1d',
        'page_size' => '10000'
      ))
      .to_return(
        status: 200,
        body: { 'data' => rows }.to_json,
        headers: { 'Content-Type' => 'application/json' }
      )
  end
end
