#!/bin/bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
export MEMORY_BANK_INDEX="${repo_root}/memory_bank/index.md"

ruby -rjson -e '
index_path = ENV.fetch("MEMORY_BANK_INDEX")
lines = File.readlines(index_path, chomp: true)

marker = "<!-- session-menu -->"
marker_index = lines.index(marker)
abort "No #{marker} block found in #{index_path}" unless marker_index

fence_start = ((marker_index + 1)...lines.length).find { |index| lines[index].start_with?("```") }
abort "No fenced session menu found after #{marker} in #{index_path}" unless fence_start

fence_end = ((fence_start + 1)...lines.length).find { |index| lines[index].start_with?("```") }
abort "Unclosed session menu fence in #{index_path}" unless fence_end

menu_lines = lines[(fence_start + 1)...fence_end].map(&:rstrip).reject(&:empty?)
abort "No commands found in #{index_path}" if menu_lines.empty?

commands = "\n" + menu_lines.join("\n")
puts JSON.generate(systemMessage: commands)
'
