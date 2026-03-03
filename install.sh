#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RUBY_VERSION_REQUIRED="4.0.1"
PG_MAJOR="17"

step()  { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()    { echo -e "  ${GREEN}✓ $1${NC}"; }
warn()  { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail()  { echo -e "  ${RED}✗ $1${NC}"; }

if [[ "$(uname)" != "Darwin" ]]; then
  fail "This script is for macOS only"
  exit 1
fi

# ── Homebrew ──────────────────────────────────────────────────────

step "Homebrew"
if command -v brew &>/dev/null; then
  ok "installed ($(brew --version | head -1))"
else
  warn "not found — installing…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "installed"
fi

# ── PostgreSQL 17 ─────────────────────────────────────────────────

step "PostgreSQL ${PG_MAJOR}"
if brew list "postgresql@${PG_MAJOR}" &>/dev/null; then
  ok "formula installed"
else
  warn "not found — installing…"
  brew install "postgresql@${PG_MAJOR}"
  ok "installed"
fi

PG_BIN="/opt/homebrew/opt/postgresql@${PG_MAJOR}/bin"
export PATH="${PG_BIN}:$PATH"

if ! brew services list | grep "postgresql@${PG_MAJOR}" | grep -q started; then
  warn "not running — starting…"
  brew services start "postgresql@${PG_MAJOR}"
  sleep 2
  ok "started"
else
  ok "running"
fi

SHELL_RC="$HOME/.zshrc"
if ! grep -q "postgresql@${PG_MAJOR}/bin" "$SHELL_RC" 2>/dev/null; then
  echo "export PATH=\"${PG_BIN}:\$PATH\"" >> "$SHELL_RC"
  ok "added to PATH in ${SHELL_RC}"
else
  ok "already in PATH"
fi

# ── TimescaleDB ───────────────────────────────────────────────────

step "TimescaleDB"
if brew list timescaledb &>/dev/null; then
  ok "formula installed"
else
  warn "not found — installing…"
  brew install timescaledb
  ok "installed"
fi

TSDB_MOVE="$(brew --prefix timescaledb)/bin/timescaledb_move.sh"
if [[ -x "$TSDB_MOVE" ]]; then
  TSDB_LIB_DIR="/opt/homebrew/opt/postgresql@${PG_MAJOR}/lib/postgresql"
  if ls "$TSDB_LIB_DIR"/timescaledb*.dylib &>/dev/null; then
    ok "libraries linked to PG${PG_MAJOR}"
  else
    warn "linking libraries to PG${PG_MAJOR}…"
    "$TSDB_MOVE"
    brew services restart "postgresql@${PG_MAJOR}"
    sleep 2
    ok "linked and PG restarted"
  fi
fi

"${PG_BIN}/psql" -d postgres -tc "CREATE EXTENSION IF NOT EXISTS timescaledb;" &>/dev/null
ok "extension available"

# ── Node.js ───────────────────────────────────────────────────────

step "Node.js"
if command -v node &>/dev/null; then
  ok "installed ($(node --version))"
else
  warn "not found — installing…"
  brew install node
  ok "installed ($(node --version))"
fi

# ── Ruby ${RUBY_VERSION_REQUIRED} via ruby-install ───────────────

RUBY_DIR="$HOME/.rubies/ruby-${RUBY_VERSION_REQUIRED}"

step "ruby-install"
if command -v ruby-install &>/dev/null; then
  ok "installed"
else
  warn "not found — installing…"
  brew install ruby-install
  ok "installed"
fi

step "Ruby ${RUBY_VERSION_REQUIRED}"
if [[ -x "${RUBY_DIR}/bin/ruby" ]]; then
  ok "installed at ${RUBY_DIR}"
else
  warn "not found — building (this takes a few minutes)…"
  ruby-install ruby "${RUBY_VERSION_REQUIRED}"
  ok "installed"
fi

export PATH="${RUBY_DIR}/bin:$PATH"
ok "active: $(ruby --version)"

if ! grep -q "rubies/ruby-${RUBY_VERSION_REQUIRED}" "$SHELL_RC" 2>/dev/null; then
  echo "export PATH=\"${RUBY_DIR}/bin:\$PATH\"" >> "$SHELL_RC"
  ok "added Ruby to PATH in ${SHELL_RC}"
else
  ok "already in PATH"
fi

# ── Bundler & gems ────────────────────────────────────────────────

step "Ruby gems"
gem install bundler --conservative --no-document &>/dev/null
ok "bundler ready"

bundle install --jobs 4
ok "bundle install done"

# ── Foreman ───────────────────────────────────────────────────────

step "Foreman"
if gem list foreman -i &>/dev/null; then
  ok "installed"
else
  gem install foreman --no-document
  ok "installed"
fi

# ── npm packages ──────────────────────────────────────────────────

step "npm packages"
npm install
ok "npm install done"

# ── Database ──────────────────────────────────────────────────────

step "Database"
DB_NAME="trade_data_analysis_development"

if "${PG_BIN}/psql" -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  ok "database ${DB_NAME} exists"
else
  warn "creating databases…"
  bin/rails db:create
  ok "created"
fi

step "Migrations"
bin/rails db:migrate
ok "migrations up to date"

# ── Verify ────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  All set! Run the app:${NC}"
echo -e "${GREEN}  $ bin/dev${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
