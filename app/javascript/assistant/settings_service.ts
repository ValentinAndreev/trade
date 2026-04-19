import {
  checkLlmConnection,
  fetchLlmSettings,
  launchLlamaServer,
  saveLlmSettings,
  stopLlamaServer,
  type LlmConnectionCheckPayload,
  type LlmSettingsDraft,
  type LlmSettingsPayload,
} from "./api"
import { showToast } from "../services/toast"

export class AssistantSettingsService {
  settings: LlmSettingsPayload | null = null
  draft: LlmSettingsDraft | null = null
  isOpen = false
  isSaving = false
  connectionCheck: LlmConnectionCheckPayload | null = null
  isChecking = false
  isLaunching = false
  isStopping = false

  constructor(
    private readonly rerender: () => void,
    private readonly setError: (msg: string | null) => void,
    // Called when the active provider changes: either explicitly saved by the user,
    // or discovered on first load (bootstrap) when no provider was previously set.
    private readonly onProviderChanged: (provider: string | null) => void,
  ) {}

  async load(provider: string | null = null, resetDraft = false) {
    const result = await fetchLlmSettings(provider || undefined)
    if (!result.ok || !result.data) {
      this.settings = null
      if (result.error && result.error !== "Unauthorized") this.setError(result.error)
      this.rerender()
      return
    }
    this.settings = result.data
    if (resetDraft || !this.draft) {
      this.draft = this.buildDraft(result.data.setting.provider)
    }
    // Bootstrap: when no provider was requested the server chose one — surface it
    // so the controller can persist it in state and dispatch to other tabs.
    if (!provider && result.data.setting.provider) {
      this.onProviderChanged(result.data.setting.provider)
    }
    this.rerender()
  }

  async save() {
    const draft = this.draft ?? this.buildDraft()
    this.isSaving = true
    this.rerender()
    try {
      const result = await saveLlmSettings(draft)
      if (!result.ok || !result.data) {
        this.setError(result.error || "Settings save failed")
        showToast(result.error || "Settings save failed")
        return
      }
      this.settings = result.data
      this.draft = this.buildDraft(result.data.setting.provider)
      this.isOpen = false
      this.setError(null)
      this.onProviderChanged(result.data.setting.provider || null)
      showToast("Assistant settings saved", "success")
    } finally {
      this.isSaving = false
      this.rerender()
    }
  }

  async check() {
    const draft = this.draft ?? this.buildDraft()
    this.isChecking = true
    this.connectionCheck = null
    this.rerender()
    try {
      const result = await checkLlmConnection(draft)
      if (!result.ok || !result.data) {
        this.setError(result.error || "Connection check failed")
        showToast(result.error || "Connection check failed")
        return
      }
      this.connectionCheck = result.data.connection
      this.setError(null)
      const ok = result.data.connection.ok
      showToast(ok ? "LLM endpoint is reachable" : (result.data.connection.error || "LLM endpoint is not reachable"), ok ? "success" : "error")
    } finally {
      this.isChecking = false
      this.rerender()
    }
  }

  async launch() {
    const draft = this.draft ?? this.buildDraft()
    this.isLaunching = true
    this.rerender()
    try {
      const result = await launchLlamaServer(draft)
      if (!result.ok || !result.data) {
        this.setError(result.error || "Server launch failed")
        showToast(result.error || "Server launch failed")
        return
      }
      this.settings = result.data
      this.draft = this.buildDraft(result.data.setting.provider)
      this.connectionCheck = null
      this.setError(null)
      showToast(result.data.launch_status?.message || "llama.cpp server started", "success")
    } finally {
      this.isLaunching = false
      this.rerender()
    }
  }

  async stop(provider: string) {
    this.isStopping = true
    this.rerender()
    try {
      const result = await stopLlamaServer(provider)
      if (!result.ok || !result.data) {
        this.setError(result.error || "Server stop failed")
        showToast(result.error || "Server stop failed")
        return
      }
      this.settings = result.data
      this.draft = this.buildDraft(result.data.setting.provider)
      this.connectionCheck = null
      this.setError(null)
      showToast(result.data.launch_status?.message || "llama.cpp server stopped", "success")
    } finally {
      this.isStopping = false
      this.rerender()
    }
  }

  open() {
    if (!this.draft) this.draft = this.buildDraft()
    this.isOpen = true
    this.rerender()
  }

  close() {
    this.isOpen = false
    this.connectionCheck = null
    this.rerender()
  }

  updateField(field: string, value: string): string | null {
    if (!this.draft) this.draft = this.buildDraft()
    this.connectionCheck = null

    if (field === "assistantSettings.provider") {
      this.draft = this.buildDraft(value)
      return value // caller also updates state + reloads settings async
    }

    const fieldMap = {
      "assistantSettings.model": "model",
      "assistantSettings.apiKey": "api_key",
      "assistantSettings.apiBase": "api_base",
      "assistantSettings.temperature": "temperature",
      "assistantSettings.maxOutputTokens": "max_output_tokens",
      "assistantSettings.launchBinaryPath": "launch_binary_path",
      "assistantSettings.launchModelPath": "launch_model_path",
      "assistantSettings.launchBindHost": "launch_bind_host",
      "assistantSettings.launchClientHost": "launch_client_host",
      "assistantSettings.launchPort": "launch_port",
      "assistantSettings.launchExtraArgs": "launch_extra_args",
    } as const satisfies Record<string, keyof LlmSettingsDraft>
    const key = fieldMap[field as keyof typeof fieldMap]
    if (key) this.draft[key] = value
    return null
  }

  buildDraft(provider?: string): LlmSettingsDraft {
    const defaults = this.settings?.defaults
    const resolvedProvider = provider || defaults?.provider || this.settings?.providers[0]?.value || ""
    const savedSetting = this.settings?.setting.provider === resolvedProvider ? this.settings.setting : null
    const saved = this.settingForProvider(resolvedProvider) || savedSetting
    const providerOption = this.providerOption(resolvedProvider)
    const defaultModel = saved?.model || this.modelSuggestionsFor(resolvedProvider)[0] || providerOption?.default_model || ""
    const launchConfig = saved?.launch_config

    return {
      provider: resolvedProvider,
      model: defaultModel,
      api_key: "",
      api_base: saved?.api_base || providerOption?.default_api_base || "",
      temperature: String(saved?.temperature ?? defaults?.temperature ?? ""),
      max_output_tokens: String(saved?.max_output_tokens ?? defaults?.max_output_tokens ?? ""),
      launch_binary_path: launchConfig?.binary_path || "",
      launch_model_path: launchConfig?.model_path || "",
      launch_bind_host: launchConfig?.bind_host || "0.0.0.0",
      launch_client_host: launchConfig?.client_host || "127.0.0.1",
      launch_port: String(launchConfig?.port ?? 8080),
      launch_extra_args: launchConfig?.extra_args || "",
    }
  }

  configured(provider: string): boolean {
    const setting = this.settingForProvider(provider)
    if (!setting?.model.trim()) return false
    return Boolean(setting.api_key_present || !setting.api_key_required)
  }

  selectedProvider(stateProvider: string | null): string {
    return stateProvider
      || this.draft?.provider
      || this.settings?.setting.provider
      || this.settings?.defaults.provider
      || this.settings?.providers[0]?.value
      || ""
  }

  modelSuggestionsFor(provider: string): string[] {
    return this.settings?.model_suggestions_by_provider?.[provider] || []
  }

  providerOption(provider: string) {
    return this.settings?.providers.find(p => p.value === provider) || null
  }

  settingForProvider(provider: string) {
    return this.settings?.settings_by_provider?.[provider] || null
  }
}
