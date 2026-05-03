#!/usr/bin/env bash
# Run the Lua test suite using plenary test harness
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

nvim --headless \
  -u "tests/minimal_init.lua" \
  -c "lua require('plenary.test_harness').test_directory('tests/', {minimal_init = 'tests/minimal_init.lua'})" \
  -c "qa!"
