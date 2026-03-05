# frozen_string_literal: true

class Api::PresetsController < Api::ApplicationController
  before_action :require_auth
  before_action :set_preset, only: %i[show update destroy]

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

  def state
    render json: Utils::SymbolStore.snapshot
  end

  def reset_state
    Utils::SymbolStore.reset!
    render json: { ok: true }
  end

  def apply_state
    Utils::SymbolStore.restore!(
      dashboard_symbols: params[:dashboardSymbols],
      market_symbols:    params[:marketsSymbols]&.to_unsafe_h,
    )
    render json: { ok: true }
  end

  private

  def set_preset
    @preset = current_user.presets.find(params[:id])
  end

  def preset_params
    permitted = params.permit(:name, :is_default)
    permitted[:payload] = params[:payload].to_unsafe_h if params[:payload].present?
    permitted
  end

  def preset_json(preset, full: false)
    data = { id: preset.id, name: preset.name, is_default: preset.is_default, updated_at: preset.updated_at.iso8601 }
    data[:payload] = preset.payload if full
    data
  end
end
