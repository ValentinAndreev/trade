import { validateResearchSystem, type ResearchValidationResponse } from "../research/dsl"
import type { SystemEditorConfig } from "../types/store"

export type { ResearchValidationResponse }

type ValidationCallback = (
  result: ResearchValidationResponse | null,
  validating: boolean,
  updatedSystemId: string | null
) => void

export class ValidationModule {
  private validationTimer: ReturnType<typeof setTimeout> | null = null
  private validationRequestId = 0

  constructor(private onResult: ValidationCallback) {}

  cancel(): void {
    if (this.validationTimer) {
      clearTimeout(this.validationTimer)
      this.validationTimer = null
    }
  }

  async run(state: SystemEditorConfig | null, immediate: boolean, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return
    this.cancel()

    const execute = async () => {
      if (signal?.aborted) return
      if (!state?.systemYaml.trim()) {
        this.onResult(null, false, null)
        return
      }

      const requestId = ++this.validationRequestId
      this.onResult(null, true, null)

      const validation = await validateResearchSystem(state.systemYaml, state.systemId || undefined, signal)
      if (signal?.aborted) return
      if (requestId !== this.validationRequestId) return

      const updatedId = validation?.ok && validation.system ? validation.system.id : null
      this.onResult(validation, false, updatedId)
    }

    if (immediate) {
      await execute()
      return
    }

    this.validationTimer = setTimeout(() => {
      this.validationTimer = null
      void execute()
    }, 300)
  }
}
