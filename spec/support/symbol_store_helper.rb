# frozen_string_literal: true

RSpec.configure do |config|
  config.around(:each, :symbol_store) do |example|
    original_dashboard = Utils::SymbolStore::DASHBOARD_PATH
    original_markets = Utils::SymbolStore::MARKETS_PATH

    tmp_dir = Rails.root.join('tmp/test_symbol_store')
    FileUtils.mkdir_p(tmp_dir)

    Utils::SymbolStore.send(:remove_const, :DASHBOARD_PATH)
    Utils::SymbolStore.const_set(:DASHBOARD_PATH, tmp_dir.join('dashboard.yml'))

    Utils::SymbolStore.send(:remove_const, :MARKETS_PATH)
    Utils::SymbolStore.const_set(:MARKETS_PATH, tmp_dir.join('markets.yml'))

    example.run
  ensure
    FileUtils.rm_rf(tmp_dir)

    Utils::SymbolStore.send(:remove_const, :DASHBOARD_PATH)
    Utils::SymbolStore.const_set(:DASHBOARD_PATH, original_dashboard)

    Utils::SymbolStore.send(:remove_const, :MARKETS_PATH)
    Utils::SymbolStore.const_set(:MARKETS_PATH, original_markets)
  end
end
