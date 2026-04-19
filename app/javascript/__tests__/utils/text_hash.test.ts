import { describe, it, expect } from "vitest"
import { hashText } from "../../utils/text_hash"

// FNV-1a 32-bit — must stay stable across sessions (yaml_hash flows frontend → backend → frontend)

describe("hashText", () => {
  it("returns 8-character hex string", () => {
    const result = hashText("hello")
    expect(result).toHaveLength(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it("is deterministic — same input always same output", () => {
    const input = "id: rsi_threshold\nname: RSI Threshold"
    expect(hashText(input)).toBe(hashText(input))
  })

  it("empty string returns known FNV offset basis hex", () => {
    // FNV-1a of empty string = offset basis 2166136261 = 0x811c9dc5
    expect(hashText("")).toBe("811c9dc5")
  })

  it("single character hashes correctly", () => {
    // 'a' = 0x61: hash = (2166136261 ^ 0x61) * 16777619 mod 2^32
    const result = hashText("a")
    expect(result).toHaveLength(8)
    expect(result).not.toBe("811c9dc5")
  })

  it("different inputs produce different hashes", () => {
    expect(hashText("abc")).not.toBe(hashText("abcd"))
    expect(hashText("BTCUSD")).not.toBe(hashText("ETHUSD"))
  })

  it("whitespace-sensitive — trailing newline changes hash", () => {
    expect(hashText("yaml")).not.toBe(hashText("yaml\n"))
  })

  it("pads with leading zeros when hash is short", () => {
    // Verify output is always exactly 8 chars regardless of leading zeros
    for (const input of ["", "a", "abc", "1234567890"]) {
      expect(hashText(input)).toHaveLength(8)
    }
  })

  it("handles multi-line YAML string", () => {
    const yaml = [
      "id: my_system",
      "name: My System",
      "modules: {}",
      "conditions: {}",
    ].join("\n")
    const hash = hashText(yaml)
    expect(hash).toHaveLength(8)
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
    // Changing one char changes the hash
    const modified = yaml.replace("My System", "My System2")
    expect(hashText(modified)).not.toBe(hash)
  })

  it("unicode characters hash without throwing", () => {
    expect(() => hashText("символы")).not.toThrow()
    expect(hashText("символы")).toHaveLength(8)
  })
})
