const DEFAULTS = {
  volumeVisible: true,
  volumeRatio: 0.25,
}

function load(key, fallback) {
  try {
    const val = localStorage.getItem(key)
    return val === null ? fallback : val
  } catch { return fallback }
}

function save(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function loadVolumeVisible() {
  return load("chart-volume-visible", null) === null
    ? DEFAULTS.volumeVisible
    : load("chart-volume-visible") === "true"
}

export function saveVolumeVisible(value) {
  save("chart-volume-visible", value)
}

export function loadVolumeRatio() {
  const val = parseFloat(load("chart-volume-ratio", null))
  return val > 0 && val <= 0.8 ? val : DEFAULTS.volumeRatio
}

export function saveVolumeRatio(value) {
  save("chart-volume-ratio", value)
}
