#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RUBY_VERSION_REQUIRED="4.0.1"
PG_MAJOR="17"
NODE_MAJOR="22"

step()  { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()    { echo -e "  ${GREEN}✓ $1${NC}"; }
warn()  { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail()  { echo -e "  ${RED}✗ $1${NC}"; }

if [[ "$(uname)" != "Linux" ]]; then
  fail "This script is for Ubuntu/Debian only. Use install.sh on macOS."
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  fail "Do not run as root. Run as a regular user with sudo access."
  exit 1
fi

# ── System dependencies ───────────────────────────────────────────

step "System packages"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release \
  build-essential git libssl-dev libreadline-dev zlib1g-dev \
  libyaml-dev libffi-dev libgmp-dev \
  libpq-dev
ok "system packages installed"

# ── PostgreSQL 17 ─────────────────────────────────────────────────

step "PostgreSQL ${PG_MAJOR}"
if dpkg -l "postgresql-${PG_MAJOR}" &>/dev/null; then
  ok "already installed"
else
  warn "not found — adding PGDG repository and installing…"
  curl -fsSL "https://www.postgresql.org/media/keys/ACCC4CF8.asc" \
    | sudo gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] \
    https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y "postgresql-${PG_MAJOR}" "postgresql-client-${PG_MAJOR}"
  ok "installed"
fi

PG_BIN="/usr/lib/postgresql/${PG_MAJOR}/bin"
export PATH="${PG_BIN}:$PATH"

if ! pg_lsclusters | grep -q "^${PG_MAJOR}.*online"; then
  warn "not running — starting…"
  sudo systemctl enable --now "postgresql@${PG_MAJOR}-main"
  sleep 2
  ok "started"
else
  ok "running"
fi

# Allow the current user to create databases (needed for db:prepare)
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$USER'" | grep -q 1; then
  warn "creating PostgreSQL role for $USER…"
  sudo -u postgres createuser --superuser "$USER"
  ok "role created"
else
  ok "PostgreSQL role exists"
fi

# ── TimescaleDB ───────────────────────────────────────────────────

step "TimescaleDB"
if dpkg -l "timescaledb-2-postgresql-${PG_MAJOR}" &>/dev/null; then
  ok "already installed"
else
  warn "not found — adding TimescaleDB repository and installing…"
  curl -fsSL "https://packagecloud.io/timescale/timescaledb/gpgkey" \
    | sudo gpg --dearmor -o /etc/apt/keyrings/timescaledb.gpg
  echo "deb [signed-by=/etc/apt/keyrings/timescaledb.gpg] \
    https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -cs) main" \
    | sudo tee /etc/apt/sources.list.d/timescaledb.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y "timescaledb-2-postgresql-${PG_MAJOR}"
  ok "installed"
fi

# Tune PostgreSQL for TimescaleDB and restart to load the extension
if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'" | grep -q 1; then
  warn "configuring shared_preload_libraries for TimescaleDB…"
  sudo timescaledb-tune --quiet --yes --pg-config="${PG_BIN}/pg_config"
  sudo systemctl restart "postgresql@${PG_MAJOR}-main"
  sleep 3
  ok "configured and restarted"
else
  ok "extension available"
fi

if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'" | grep -q 1; then
  fail "timescaledb extension not available — check installation"
  exit 1
fi

# ── Node.js ───────────────────────────────────────────────────────

step "Node.js ${NODE_MAJOR}"
if command -v node &>/dev/null && [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -ge "$NODE_MAJOR" ]]; then
  ok "installed ($(node --version))"
else
  warn "not found or outdated — installing via NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "installed ($(node --version))"
fi

# ── ruby-install ──────────────────────────────────────────────────

step "ruby-install"
if command -v ruby-install &>/dev/null; then
  ok "installed"
else
  warn "not found — installing from GitHub…"
  RUBY_INSTALL_VERSION="0.9.3"
  curl -fsSL "https://github.com/postmodern/ruby-install/releases/download/v${RUBY_INSTALL_VERSION}/ruby-install-${RUBY_INSTALL_VERSION}.tar.gz" \
    | tar -xz -C /tmp
  cd "/tmp/ruby-install-${RUBY_INSTALL_VERSION}"
  sudo make install
  cd -
  ok "installed"
fi

# ── chruby ────────────────────────────────────────────────────────

step "chruby"
if command -v chruby-exec &>/dev/null || [[ -f /usr/local/share/chruby/chruby.sh ]]; then
  ok "installed"
else
  warn "not found — installing from GitHub…"
  CHRUBY_VERSION="0.3.9"
  curl -fsSL "https://github.com/postmodern/chruby/releases/download/v${CHRUBY_VERSION}/chruby-${CHRUBY_VERSION}.tar.gz" \
    | tar -xz -C /tmp
  cd "/tmp/chruby-${CHRUBY_VERSION}"
  sudo make install
  cd -
  ok "installed"
fi

SHELL_RC="$HOME/.bashrc"
if ! grep -q "chruby.sh" "$SHELL_RC" 2>/dev/null; then
  cat >> "$SHELL_RC" <<'SHELL'

# chruby
source /usr/local/share/chruby/chruby.sh
source /usr/local/share/chruby/auto.sh
SHELL
  ok "chruby added to ${SHELL_RC}"
else
  ok "chruby already in ${SHELL_RC}"
fi

source /usr/local/share/chruby/chruby.sh

# ── Ruby ──────────────────────────────────────────────────────────

RUBY_DIR="$HOME/.rubies/ruby-${RUBY_VERSION_REQUIRED}"

step "Ruby ${RUBY_VERSION_REQUIRED}"
if [[ -x "${RUBY_DIR}/bin/ruby" ]]; then
  ok "installed at ${RUBY_DIR}"
else
  warn "not found — building (this takes a few minutes)…"
  ruby-install ruby "${RUBY_VERSION_REQUIRED}"
  ok "installed"
fi

chruby "ruby-${RUBY_VERSION_REQUIRED}"
ok "active: $(ruby --version)"

# ── Bundler & gems ────────────────────────────────────────────────

step "Ruby gems"
gem install bundler --conservative --no-document &>/dev/null
ok "bundler ready"

bundle install --jobs "$(nproc)"
ok "bundle install done"

# ── npm packages ──────────────────────────────────────────────────

step "npm packages"
npm install
ok "npm install done"

# ── Database ──────────────────────────────────────────────────────

DB_NAME="trade_data_analysis_development"

step "Database setup"
bin/rails db:prepare
ok "database ready (created/migrated as needed)"

step "Database seed"
bin/rails db:seed
ok "seed data loaded"

# ── TimescaleDB objects (hypertable + continuous aggregates) ──────

step "TimescaleDB verification"

HT_COUNT=$(psql -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'candles'" 2>/dev/null || echo "0")

if [[ "$HT_COUNT" -lt 1 ]]; then
  warn "candles hypertable missing — recreating…"
  psql -d "$DB_NAME" -c \
    "SELECT create_hypertable('candles', 'ts', chunk_time_interval => INTERVAL '3 months', migrate_data => true);"
  psql -d "$DB_NAME" -c \
    "ALTER TABLE candles SET (timescaledb.compress, timescaledb.compress_segmentby = 'symbol,exchange', timescaledb.compress_orderby = 'ts DESC');"
  psql -d "$DB_NAME" -c \
    "SELECT add_compression_policy('candles', INTERVAL '7 days');"
  ok "hypertable created"
else
  ok "candles hypertable exists"
fi

CAGG_COUNT=$(psql -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM timescaledb_information.continuous_aggregates WHERE materialization_hypertable_schema = 'public'" 2>/dev/null || echo "0")

if [[ "$CAGG_COUNT" -lt 5 ]]; then
  warn "continuous aggregates missing ($CAGG_COUNT/5) — recreating…"

  for TF_SPEC in "5m:5 minutes" "15m:15 minutes" "1h:1 hour" "4h:4 hours" "1d:1 day"; do
    TF_NAME="${TF_SPEC%%:*}"
    TF_BUCKET="${TF_SPEC#*:}"
    VIEW="cagg_candles_${TF_NAME}"

    psql -d "$DB_NAME" -c "
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${VIEW}
      WITH (timescaledb.continuous) AS
      SELECT time_bucket('${TF_BUCKET}', ts) AS bucket, symbol, exchange,
             FIRST(open, ts) AS open, MAX(high) AS high, MIN(low) AS low,
             LAST(close, ts) AS close, SUM(volume) AS volume
      FROM candles GROUP BY 1, symbol, exchange WITH NO DATA;"

    psql -d "$DB_NAME" -c "
      CREATE INDEX IF NOT EXISTS idx_${VIEW}_composite
      ON ${VIEW} (symbol, exchange, bucket DESC)
      WITH (timescaledb.transaction_per_chunk);"
  done

  POLICIES='cagg_candles_5m:24 hours:5 minutes:1 minute
cagg_candles_15m:48 hours:5 minutes:1 minute
cagg_candles_1h:7 days:10 minutes:5 minutes
cagg_candles_4h:21 days:10 minutes:10 minutes
cagg_candles_1d:90 days:1 hour:30 minutes'

  while IFS=: read -r PVIEW START_OFF END_OFF SCHED; do
    psql -d "$DB_NAME" -c \
      "SELECT add_continuous_aggregate_policy('${PVIEW}', start_offset => INTERVAL '${START_OFF}', end_offset => INTERVAL '${END_OFF}', schedule_interval => INTERVAL '${SCHED}');" 2>/dev/null || true
  done <<< "$POLICIES"

  for TF_NAME in 5m 15m 1h 4h 1d; do
    psql -d "$DB_NAME" -c "CALL refresh_continuous_aggregate('cagg_candles_${TF_NAME}', NULL, NULL);"
  done

  ok "continuous aggregates created and refreshed"
else
  ok "continuous aggregates exist ($CAGG_COUNT/5)"
fi

# ── Done ──────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  All set! Run the app:${NC}"
echo -e "${GREEN}  $ bin/dev${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
