// FNV-1a 32-bit — matches the algorithm used before the refactor.
// yaml_hash values flow from frontend → backend (draft envelope) → frontend (comparison),
// so the algorithm must stay stable across sessions; do not change it lightly.
export function hashText(value: string): string {
  let hash = 2166136261 // FNV offset basis (32-bit)
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0 // FNV prime, keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0")
}
