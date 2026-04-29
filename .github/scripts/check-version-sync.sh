#!/usr/bin/env bash
set -euo pipefail

# Extract mise pi version (e.g. pi = "0.70.6")
mise_version=$(grep -E '^\s*pi\s*=' mise/.config/mise/config.toml | sed -E 's/.*=\s*"([^"]+)".*/\1/')
if [ -z "$mise_version" ]; then
  echo "ERROR: Could not extract pi version from mise/.config/mise/config.toml"
  exit 1
fi

# Extract the semver range from npm pi packages (e.g. ^0.70.2)
npm_range=$(grep -E '"@mariozechner/pi-(ai|coding-agent|tui|agent-core)"' pi/.pi/agent/extensions/package.json | head -1 | sed -E 's/.*"([">=<!^~]+[0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
if [ -z "$npm_range" ]; then
  echo "ERROR: Could not extract pi package range from pi/.pi/agent/extensions/package.json"
  exit 1
fi

# Semver range satisfaction check (handles ^X.Y.Z caret ranges)
semver_satisfies() {
  local version=$1 range=$2

  # Strip ^ prefix
  range="${range#^}"

  local v_major v_minor v_patch
  local r_major r_minor r_patch
  v_major=$(echo "$version" | cut -d. -f1)
  v_minor=$(echo "$version" | cut -d. -f2)
  v_patch=$(echo "$version" | cut -d. -f3)
  r_major=$(echo "$range" | cut -d. -f1)
  r_minor=$(echo "$range" | cut -d. -f2)
  r_patch=$(echo "$range" | cut -d. -f3)

  # Lower bound: version >= range (all cases)
  if [ "$v_major" -lt "$r_major" ] 2>/dev/null; then return 1; fi
  if [ "$v_major" -gt "$r_major" ] 2>/dev/null; then return 1; fi

  # Same major
  if [ "$v_minor" -lt "$r_minor" ] 2>/dev/null; then return 1; fi

  if [ "$r_major" -gt 0 ] 2>/dev/null; then
    # ^X.Y.Z where X>0: any minor/patch >= Y.Z within same major is fine
    return 0
  fi

  # For ^0.Y.Z: upper bound is 0.(Y+1).0 (exclusive)
  if [ "$v_minor" -gt "$r_minor" ] 2>/dev/null; then
    local upper_minor=$((r_minor + 1))
    if [ "$v_minor" -ge "$upper_minor" ] 2>/dev/null; then return 1; fi
    return 0
  fi

  # Same minor: patch >= range patch
  if [ "$v_patch" -lt "$r_patch" ] 2>/dev/null; then return 1; fi
  return 0
}

if ! semver_satisfies "$mise_version" "$npm_range"; then
  echo "ERROR: mise pi version does not satisfy npm package range"
  echo "  mise/.config/mise/config.toml:      pi = $mise_version"
  echo "  pi/.pi/agent/extensions/package.json: @mariozechner/pi-* = $npm_range"
  echo ""
  echo "  If the npm range needs an update, run:"
  echo "    mise run pi-version-sync $mise_version"
  exit 1
fi

echo "OK: mise pi ($mise_version) satisfies npm range ($npm_range)"
