# frozen_string_literal: true

class Api::ResearchController < Api::ApplicationController
  def catalog
    render json: {
      systems:     Research::Systems::Catalog.entries.map(&:to_h),
      directories: Research::Systems::Catalog.directory_paths
    }
  end

  def editor_metadata
    render json: Research::Systems::EditorMetadata.response
  end

  def cancel
    run_id = params[:run_id].to_s
    return render json: { ok: false }, status: :bad_request if run_id.blank?

    Research::CancellationRegistry.cancel(run_id)
    render json: { ok: true }
  end

  def validate
    yaml = params[:system_yaml].presence || Research::Systems::Catalog.load_yaml(params[:system_id], relative_path: params[:system_path])
    return render json: missing_yaml_response, status: :unprocessable_entity if yaml.blank?

    validation = Research::Systems::Validation::Validator.new(yaml).call
    render json: {
      ok:          validation.valid?,
      diagnostics: validation.diagnostics.map(&:to_h),
      system:      validation.metadata
    }
  end

  def save_system
    yaml = params[:system_yaml].to_s
    return render json: missing_yaml_response, status: :unprocessable_entity if yaml.blank?

    entry = Research::Systems::Repository.save_system(
      yaml,
      source_relative_path:    params[:source_path],
      directory_relative_path: params[:directory_path]
    )
    render json: { ok: true, diagnostics: [], system: entry.to_h }
  rescue Research::Systems::Validation::Error => e
    render json: { ok: false, diagnostics: e.diagnostics.map(&:to_h), system: nil }, status: :unprocessable_entity
  end

  def rename_system
    yaml = params[:system_yaml].to_s
    return render json: missing_yaml_response, status: :unprocessable_entity if yaml.blank?

    entry = Research::Systems::Repository.rename_entry(
      source_relative_path: params[:source_path],
      target_id:            params[:target_system_id].to_s,
      yaml:                 yaml
    )
    render json: { ok: true, diagnostics: [], system: entry.to_h }
  rescue Research::Systems::Validation::Error => e
    render json: { ok: false, diagnostics: e.diagnostics.map(&:to_h), system: nil }, status: :unprocessable_entity
  end

  def delete_system
    Research::Systems::Repository.delete_entry(source_relative_path: params[:source_path])
    render json: { ok: true, diagnostics: [], deleted_system_path: params[:source_path] }
  rescue Research::Systems::Validation::Error => e
    render json: { ok: false, diagnostics: e.diagnostics.map(&:to_h), deleted_system_path: nil }, status: :unprocessable_entity
  end

  def create_directory
    path = Research::Systems::Repository.create_directory(
      parent_relative_path: params[:parent_path],
      directory_name:       params[:directory_name]
    )
    render json: { ok: true, diagnostics: [], path: path }
  rescue Research::Systems::Validation::Error => e
    render json: { ok: false, diagnostics: e.diagnostics.map(&:to_h), path: nil }, status: :unprocessable_entity
  end

  def rename_directory
    path = Research::Systems::Repository.rename_directory(
      source_relative_path: params[:source_path],
      target_name:          params[:target_name]
    )
    render json: { ok: true, diagnostics: [], path: path }
  rescue Research::Systems::Validation::Error => e
    render json: { ok: false, diagnostics: e.diagnostics.map(&:to_h), path: nil }, status: :unprocessable_entity
  end

  def delete_directory
    Research::Systems::Repository.delete_directory(source_relative_path: params[:source_path])
    render json: { ok: true, diagnostics: [], deleted_path: params[:source_path] }
  rescue Research::Systems::Validation::Error => e
    render json: { ok: false, diagnostics: e.diagnostics.map(&:to_h), deleted_path: nil }, status: :unprocessable_entity
  end

  def run
    request_started_at = monotonic_now
    progress           = nil
    research_request = Research::RunRequest.new(research_payload)
    backtest         = Research::Backtest.new(**research_request.backtest_config)
    progress         = Research::ProgressBroadcaster.new(run_id: research_request.progress_run_id)

    runs = if research_request.optimization_enabled?
      Research::Optimizer.new(
        backtest:    backtest,
        system:      research_request.system,
        base_params: research_request.runtime_params
      ).call(
        target:   research_request.optimization_target,
        progress: progress,
        run_id:   research_request.progress_run_id,
        **research_request.optimization_range
      )
    else
      progress.started(total_runs: 1, mode: :normal)

      run_started_at = monotonic_now
      run            = backtest.run(params: research_request.runtime_params)

      progress.run_completed(
        total_runs:     1,
        completed_runs: 1,
        last_run_ms:    elapsed_ms(run_started_at),
        elapsed_ms:     elapsed_ms(request_started_at)
      )
      progress.finished(total_runs: 1, elapsed_ms: elapsed_ms(request_started_at))

      [ run ]
    end

    total_trades = runs.sum { |run| Array(run[:trades]).length }
    Rails.logger.info(
      "[Research] runs=#{runs.length} total_trades=#{total_trades} " \
      "optimization=#{research_request.optimization_enabled?} " \
      "compute_ms=#{elapsed_ms(request_started_at).round}"
    )

    render json: research_request.response_payload(runs:)
  rescue Research::Systems::Validation::Error => e
    progress&.failed(message: e.message, elapsed_ms: request_started_at ? elapsed_ms(request_started_at) : nil)
    render json: { error: e.message, diagnostics: e.diagnostics.map(&:to_h) }, status: :unprocessable_entity
  rescue TechnicalAnalysis::Validation::ValidationError => e
    progress&.failed(message: e.message, elapsed_ms: request_started_at ? elapsed_ms(request_started_at) : nil)
    render json: { error: e.message }, status: :unprocessable_entity
  rescue StandardError => e
    progress&.failed(message: e.message, elapsed_ms: request_started_at ? elapsed_ms(request_started_at) : nil)
    raise
  end

  private

  def monotonic_now
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def elapsed_ms(started_at)
    (monotonic_now - started_at) * 1000.0
  end

  def research_payload
    params.to_unsafe_h.deep_symbolize_keys
  end

  def missing_yaml_response
    { ok: false, diagnostics: [ Research::Systems::Validation::Diagnostic.yaml_missing.to_h ], system: nil }
  end
end
