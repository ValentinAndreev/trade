import type { ResearchDslDiagnostic } from "../research/dsl"

export default class DiagnosticsStore {
  private diagnostics = new Map<string, ResearchDslDiagnostic[]>()

  get(tabId: string): ResearchDslDiagnostic[] {
    return this.diagnostics.get(tabId) || []
  }

  set(tabId: string, diagnostics: ResearchDslDiagnostic[]): void {
    this.diagnostics.set(tabId, diagnostics)
  }

  delete(tabId: string): void {
    this.diagnostics.delete(tabId)
  }

  clear(): void {
    this.diagnostics.clear()
  }
}
