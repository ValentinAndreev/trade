# frozen_string_literal: true

class Api::PresetsController < Api::ApplicationController
  before_action :require_auth
  before_action :set_preset, only: %i[show update destroy]

  DASHBOARD_YAML = Rails.root.join("config/dashboard.yml")
  MARKETS_YAML   = Rails.root.join("config/markets.yml")

  def index
    presets = current_user.presets.order(:name)
    render json: presets.map { |p| preset_json(p) }
  end

  def show
    render json: preset_json(@preset, full: true)
  end

  def create
    preset = current_user.presets.find_or_initialize_by(name: params[:name])
    preset.assign_attributes(preset_params)

    if preset.save
      render json: preset_json(preset, full: true), status: (preset.previously_new_record? ? :created : :ok)
    else
      render json: { errors: preset.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @preset.update(preset_params)
      render json: preset_json(@preset, full: true)
    else
      render json: { errors: @preset.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @preset.destroy!
    render json: { ok: true }
  end

  # GET /api/presets/state — current server-side symbols for saving into preset
  def state
    render json: {
      dashboardSymbols: load_dashboard_symbols,
      marketsSymbols: load_markets_symbols,
    }
  end

  # POST /api/presets/reset_state — delete custom YAMLs so defaults from configs kick in
  def reset_state
    DASHBOARD_YAML.delete if DASHBOARD_YAML.exist?
    MARKETS_YAML.delete if MARKETS_YAML.exist?
    render json: { ok: true }
  end

  # POST /api/presets/apply_state — restore server-side symbols from preset
  def apply_state
    body = JSON.parse(request.body.read)

    if body["dashboardSymbols"].is_a?(Array)
      DASHBOARD_YAML.write({ "symbols" => body["dashboardSymbols"] }.to_yaml)
    end

    if body["marketsSymbols"].is_a?(Hash)
      MARKETS_YAML.write({ "symbols" => body["marketsSymbols"] }.to_yaml)
    end

    render json: { ok: true }
  end

  private

  def set_preset
    @preset = current_user.presets.find(params[:id])
  end

  def preset_params
    permitted = params.permit(:name, :is_default)
    if params[:payload].present?
      permitted[:payload] = params[:payload].respond_to?(:to_unsafe_h) ? params[:payload].to_unsafe_h : params[:payload]
    end
    permitted
  end

  def preset_json(preset, full: false)
    data = { id: preset.id, name: preset.name, is_default: preset.is_default, updated_at: preset.updated_at.iso8601 }
    data[:payload] = preset.payload if full
    data
  end

  def load_dashboard_symbols
    return nil unless DASHBOARD_YAML.exist?

    data = YAML.safe_load_file(DASHBOARD_YAML)
    data&.fetch("symbols", nil)
  end

  def load_markets_symbols
    return nil unless MARKETS_YAML.exist?

    data = YAML.safe_load_file(MARKETS_YAML)
    data&.fetch("symbols", nil)
  end
end
