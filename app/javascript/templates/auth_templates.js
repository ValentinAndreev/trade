const INPUT_CLASS = "w-full mb-3 px-3 py-2 bg-[#0a0a1e] border border-[#2a2a3e] rounded text-white text-sm focus:outline-none focus:border-blue-500"
const BTN_PRIMARY = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
const BTN_SUCCESS = "px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
const BTN_LINK = "px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
const BTN_CANCEL = "ml-auto px-4 py-2 text-gray-500 hover:text-white text-sm transition-colors"
const ERROR_BLOCK = '<div data-auth-target="error" class="text-red-400 text-xs mb-2 hidden"></div>'

export function userAreaHTML(username, presetName) {
  const presetLabel = presetName
    ? `<span class="text-blue-400 text-xs">[${presetName}]</span>` : ""
  return `
    <div class="flex items-center gap-2">
      <span class="text-gray-400 text-sm">${username}</span>
      ${presetLabel}
      <button data-action="click->auth#showPresetsMenu" class="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-[#2a2a3e] transition-colors">Presets</button>
      <button data-action="click->auth#logout" class="text-gray-500 hover:text-red-400 text-sm px-2 py-1 rounded hover:bg-red-400/10 transition-colors">Logout</button>
    </div>
  `
}

export function loginButtonHTML() {
  return `<button data-action="click->auth#showLoginForm" class="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-[#2a2a3e] transition-colors">Login</button>`
}

export function loginFormHTML() {
  return `
    <h3 class="text-white text-lg font-semibold mb-4">Login</h3>
    <form data-action="submit->auth#doLogin">
      <input name="username" placeholder="Username" autocomplete="username" class="${INPUT_CLASS}" />
      <input name="password" type="password" placeholder="Password" autocomplete="current-password" class="${INPUT_CLASS}" />
      ${ERROR_BLOCK}
      <div class="flex gap-2">
        <button type="submit" class="${BTN_PRIMARY}">Login</button>
        <button type="button" data-action="click->auth#showRegisterForm" class="${BTN_LINK}">Register</button>
        <button type="button" data-action="click->auth#closeModal" class="${BTN_CANCEL}">Cancel</button>
      </div>
    </form>
  `
}

export function registerFormHTML() {
  return `
    <h3 class="text-white text-lg font-semibold mb-4">Register</h3>
    <form data-action="submit->auth#doRegister">
      <input name="username" placeholder="Username" autocomplete="username" class="${INPUT_CLASS}" />
      <input name="password" type="password" placeholder="Password (min 4 chars)" autocomplete="new-password" class="${INPUT_CLASS}" />
      ${ERROR_BLOCK}
      <div class="flex gap-2">
        <button type="submit" class="${BTN_SUCCESS}">Register</button>
        <button type="button" data-action="click->auth#showLoginForm" class="${BTN_LINK}">Back to Login</button>
        <button type="button" data-action="click->auth#closeModal" class="${BTN_CANCEL}">Cancel</button>
      </div>
    </form>
  `
}

export function presetsMenuHTML(presets, activePreset) {
  const rows = presets.map(p => {
    const isCurrent = activePreset && activePreset.id === p.id
    const badge = isCurrent ? '<span class="text-green-400 text-xs">(current)</span>'
                 : p.is_default ? '<span class="text-blue-400 text-xs">(default)</span>' : ""
    return `
      <div class="flex items-center justify-between py-2 border-b border-[#2a2a3e] last:border-0">
        <button data-action="click->auth#applyPreset" data-preset-id="${p.id}" data-preset-name="${p.name}"
                class="text-gray-300 hover:text-white text-sm transition-colors text-left flex-1">
          ${p.name} ${badge}
          <span class="text-gray-600 text-xs ml-2">${new Date(p.updated_at).toLocaleDateString()}</span>
        </button>
        <button data-action="click->auth#removePreset" data-preset-id="${p.id}"
                class="text-gray-600 hover:text-red-400 text-xs ml-2 transition-colors">&times;</button>
      </div>
    `
  }).join("")

  return `
    <h3 class="text-white text-lg font-semibold mb-4">Presets</h3>
    <div class="mb-4 max-h-60 overflow-y-auto">${rows || '<div class="text-gray-500 text-sm">No presets yet</div>'}</div>
    <div class="flex gap-2">
      <button data-action="click->auth#showSavePreset" class="${BTN_PRIMARY}">Save Current</button>
      <button data-action="click->auth#closeModal" class="${BTN_CANCEL}">Close</button>
    </div>
  `
}

export function savePresetFormHTML(defaultName) {
  return `
    <h3 class="text-white text-lg font-semibold mb-4">Save Preset</h3>
    <form data-action="submit->auth#doSavePreset">
      <input name="presetName" placeholder="Preset name" value="${defaultName}" class="${INPUT_CLASS}" />
      <label class="flex items-center gap-2 mb-3 text-gray-400 text-sm cursor-pointer">
        <input type="checkbox" name="isDefault" class="accent-blue-500" /> Set as default
      </label>
      <p class="text-gray-600 text-xs mb-3">If a preset with this name exists, it will be overwritten.</p>
      ${ERROR_BLOCK}
      <div class="flex gap-2">
        <button type="submit" class="${BTN_SUCCESS}">Save</button>
        <button type="button" data-action="click->auth#showPresetsMenu" class="${BTN_LINK}">Back</button>
        <button type="button" data-action="click->auth#closeModal" class="${BTN_CANCEL}">Cancel</button>
      </div>
    </form>
  `
}

export function presetPickerHTML(presets) {
  const rows = presets.map(p => `
    <button data-action="click->auth#applyPreset" data-preset-id="${p.id}" data-preset-name="${p.name}"
            class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-500/20 hover:text-white transition-colors rounded">
      ${p.name} ${p.is_default ? '<span class="text-blue-400 text-xs">(default)</span>' : ""}
    </button>
  `).join("")

  return `
    <h3 class="text-white text-lg font-semibold mb-4">Load Preset</h3>
    <div class="mb-4">${rows}</div>
    <button data-action="click->auth#closeModal" class="${BTN_CANCEL}">Skip</button>
  `
}
