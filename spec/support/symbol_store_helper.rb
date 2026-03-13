# frozen_string_literal: true

RSpec.configure do |config|
  config.before(:each, :symbol_store) do
    @symbol_store_tmp_dir = Rails.root.join('tmp/test_symbol_store')
    config_path = @symbol_store_tmp_dir.join('dashboard.yml')
    current_path = @symbol_store_tmp_dir.join('dashboard.current.yml')
    FileUtils.mkdir_p(@symbol_store_tmp_dir)

    FileUtils.cp(DashboardConfig.config_path, config_path) if DashboardConfig.config_path.exist?

    allow(DashboardConfig).to receive(:config_path).and_return(config_path)
    allow(DashboardConfig).to receive(:current_path).and_return(current_path)
  end

  config.after(:each, :symbol_store) do
    FileUtils.rm_rf(@symbol_store_tmp_dir) if defined?(@symbol_store_tmp_dir) && @symbol_store_tmp_dir
  end
end
