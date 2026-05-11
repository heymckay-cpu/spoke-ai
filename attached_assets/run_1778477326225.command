#!/bin/bash
# Wheel Screener — one-click runner for macOS.
#
# Double-click this file in Finder. It will:
#   1. Open a Terminal window
#   2. Set up the virtual environment if it doesn't exist
#   3. Install dependencies if they're missing
#   4. Run the screener with the default watchlist
#   5. Save a timestamped CSV of the results to your Desktop
#   6. Keep the window open so you can read the table
#
# To customize what runs, edit the EXTRA_ARGS line below.

set -e

# Always work from the directory this script lives in, regardless of
# where it was launched from.
cd "$(dirname "$0")"

# ---- styling -----------------------------------------------------------------
BOLD=$'\033[1m'
DIM=$'\033[2m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
RESET=$'\033[0m'

say()  { printf "%s\n" "${BOLD}$*${RESET}"; }
info() { printf "%s\n" "${DIM}$*${RESET}"; }
ok()   { printf "%s\n" "${GREEN}✓ $*${RESET}"; }
warn() { printf "%s\n" "${YELLOW}! $*${RESET}"; }
err()  { printf "%s\n" "${RED}✗ $*${RESET}"; }

# Keep the Terminal window open after the script finishes (success or error)
# so the user can read what happened.
hold_open() {
  echo
  info "Press Return to close this window."
  read -r _ || true
}
trap hold_open EXIT

# ---- 1. find a Python interpreter --------------------------------------------
say "Wheel Screener"
echo

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  err "Python 3 isn't installed."
  echo "  Install it from https://www.python.org/downloads/macos/"
  echo "  or run: brew install python"
  exit 1
fi

PY_VERSION=$($PY -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
info "Using $PY (Python $PY_VERSION)"

# ---- 2. create the virtual env if missing ------------------------------------
if [ ! -d ".venv" ]; then
  say "Setting up virtual environment (first run only)..."
  $PY -m venv .venv
  ok "Created .venv/"
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# ---- 3. install dependencies if not already installed ------------------------
# We probe for `yfinance` because if that's there, the rest are too.
if ! python -c "import yfinance" >/dev/null 2>&1; then
  say "Installing dependencies (first run only)..."
  pip install --upgrade pip >/dev/null
  pip install -r requirements.txt
  ok "Dependencies installed."
else
  info "Dependencies already installed."
fi

# ---- 4. run the screener -----------------------------------------------------
TIMESTAMP=$(date +"%Y-%m-%d_%H%M")
CSV_PATH="$HOME/Desktop/wheel_candidates_${TIMESTAMP}.csv"

# Customize the run here — uncomment / edit to change watchlist or params.
# Examples:
#   EXTRA_ARGS=(--tickers AAPL MSFT NVDA F SOFI)
#   EXTRA_ARGS=(--target-delta 0.30 --min-dte 30 --max-dte 45)
EXTRA_ARGS=()

echo
say "Scanning..."
echo
python screener.py "${EXTRA_ARGS[@]}" --csv "$CSV_PATH"
RESULT=$?
echo

if [ $RESULT -eq 0 ]; then
  if [ -f "$CSV_PATH" ]; then
    ok "Results saved to: $CSV_PATH"
  fi
else
  warn "Screener exited with code $RESULT"
fi
