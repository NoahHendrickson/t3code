#!/usr/bin/env bash
# Launch isolation check for fork release builds.
#
# v0.1.1 passed every static check while its server child opened the real
# ~/.t3/userdata database read-write — only launching the packaged app proves
# isolation. This launches the DMG's bundle against a scratch HOME and asserts
# everything it creates is fork-owned: ~/.t3-fork must appear (the server
# child owns state.sqlite, so its arrival proves the child derived the fork
# base too), and nothing upstream-named may exist anywhere under the scratch
# HOME afterwards.
#
# Fork-owned — see .fork/customizations.yaml#fork-desktop-release. Runs
# locally against any directory holding the built artifacts:
#
#   bash .github/scripts/launch-isolation-check.sh release
#
# Written for the /bin/bash on macOS (3.2): no mapfile, no ${var,,}.
set -euo pipefail

usage="usage: launch-isolation-check.sh <release-dir>"
release_dir="${1:?$usage}"
if [ ! -d "$release_dir" ]; then
  echo "Release directory does not exist: $release_dir" >&2
  exit 1
fi
# pwd -P everywhere: macOS temp dirs live under /var -> /private/var, and the
# app realpath-resolves its own paths, so the server child's argv carries
# /private/var/... — a pkill/pgrep pattern built from the symlinked spelling
# never matches it, silently defeating teardown and the EXIT trap.
release_dir=$(cd "$release_dir" && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
scratch=$(cd "$(mktemp -d)" && pwd -P)
mount=$(cd "$(mktemp -d)" && pwd -P)

exactly_one() {
  # exactly_one <label> <dir> <maxdepth> <pattern> <type> — prints the match.
  local label="$1" dir="$2" depth="$3" pattern="$4" type="$5" count
  count=$(find "$dir" -maxdepth "$depth" -name "$pattern" -type "$type" | wc -l | tr -d ' ')
  if [ "$count" -ne 1 ]; then
    echo "Expected exactly one $label under $dir, found $count" >&2
    ls -l "$dir" >&2 || true
    exit 1
  fi
  find "$dir" -maxdepth "$depth" -name "$pattern" -type "$type"
}

app=""
cleanup() {
  if [ -n "$app" ]; then
    pkill -9 -f "$app/Contents" 2>/dev/null || true
  fi
  hdiutil detach "$mount" -force >/dev/null 2>&1 || true
  # $mount is deliberately not removed: rm -rf on a mountpoint whose detach
  # failed would delete files inside the image's filesystem.
  rm -rf "$work" "$scratch" 2>/dev/null || true
}
trap cleanup EXIT

dmg=$(exactly_one "*.dmg artifact" "$release_dir" 1 "*.dmg" f)
zip=$(exactly_one "*.zip artifact" "$release_dir" 1 "*.zip" f)

# Launch the DMG's bundle — the headline artifact. Copy it off the mount with
# ditto (preserving symlinks and xattrs) and detach before launching, exactly
# what a user's drag to /Applications does; holding the mount open across the
# launch would leave teardown racing a live filesystem.
hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mount" >/dev/null
dmg_app=$(exactly_one ".app bundle in the DMG" "$mount" 1 "*.app" d)
ditto "$dmg_app" "$work/$(basename "$dmg_app")"
hdiutil detach "$mount" >/dev/null
app="$work/$(basename "$dmg_app")"

# Derive the executable from the bundle rather than hardcoding the product
# name — nightly-shaped versions get a different name, and every hardcoded
# copy is one more string a rename must find. ($app is absolute, which is
# what `defaults read` needs to treat it as a path instead of a domain.)
executable=$(defaults read "$app/Contents/Info" CFBundleExecutable)
binary="$app/Contents/MacOS/$executable"
if [ ! -x "$binary" ]; then
  echo "Expected executable missing: $binary" >&2
  ls "$app/Contents/MacOS" >&2
  exit 1
fi

# The zip is what electron-updater downloads. All fork logic ships in
# app.asar (the stock Electron binary is identical across any two builds of
# the same Electron version), so hold the zip's app.asar byte-identical to
# the launched bundle's — a single-member read, no full extraction. The
# app.asar.unpacked tree is not compared: both artifacts are packaged from
# the same staged tree in one electron-builder invocation, and asar equality
# is the cheap canary for that assumption breaking.
unzip -p "$zip" "*/Contents/Resources/app.asar" >"$work/zip-app.asar"
if [ ! -s "$work/zip-app.asar" ]; then
  echo "Could not read app.asar out of $zip" >&2
  unzip -l "$zip" | head -20 >&2 || true
  exit 1
fi
if ! cmp -s "$app/Contents/Resources/app.asar" "$work/zip-app.asar"; then
  echo "The DMG and zip ship different app.asar payloads:" >&2
  shasum "$app/Contents/Resources/app.asar" "$work/zip-app.asar" >&2 || true
  exit 1
fi

dump_diagnostics() {
  echo "--- app output ---" >&2
  cat "$work/app.log" >&2 2>/dev/null || true
  echo "--- scratch tree ---" >&2
  find "$scratch" -maxdepth 3 >&2 2>/dev/null || true
  echo "--- newest crash reports (real home) ---" >&2
  # The macOS crash reporter writes to the real user home, not $HOME.
  ls -t "$HOME/Library/Logs/DiagnosticReports" 2>/dev/null | head -5 >&2 || true
}

violated() {
  echo "ISOLATION VIOLATED: $1" >&2
  find "$2" >&2 || true
  exit 1
}

env -u T3CODE_HOME HOME="$scratch" "$binary" >"$work/app.log" 2>&1 &
pid=$!
deadline=$(($(date +%s) + 180))
while :; do
  # A server-side regression creates ~/.t3 within seconds — fail immediately
  # and with the right message instead of burning the full timeout waiting on
  # a fork path that will never appear.
  if [ -e "$scratch/.t3" ]; then
    violated "the build created ~/.t3" "$scratch/.t3"
  fi
  if [ -e "$scratch/.t3-fork/userdata/state.sqlite" ]; then
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    appexit=0
    wait "$pid" || appexit=$?
    echo "App exited (status $appexit) before creating fork state" >&2
    dump_diagnostics
    exit 1
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Server never created $scratch/.t3-fork/userdata/state.sqlite within 180s" >&2
    dump_diagnostics
    exit 1
  fi
  sleep 2
done

# Tear down the whole bundle's process tree and wait until it is actually
# dead before the negative assertions — the server child can outlive the
# Electron main, and a lazy write after teardown must still fail the check.
pkill -TERM -f "$app/Contents" 2>/dev/null || true
shutdown_deadline=$(($(date +%s) + 30))
while pgrep -f "$app/Contents" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$shutdown_deadline" ]; then
    pkill -9 -f "$app/Contents" 2>/dev/null || true
    sleep 2
    break
  fi
  sleep 1
done

# The scratch HOME started empty and the app was its only writer, so sweep
# for anything upstream-named anywhere under it instead of whitelisting the
# two directories we already know about — this catches the next isolation
# miss (an Electron Caches/Logs/Preferences path derived from an upstream
# name), not just the last one. Exact -name matches: none of these match
# their -fork variants.
strays=$(find "$scratch" -maxdepth 5 \
  \( -name ".t3" -o -name "t3code" -o -name "com.t3tools.t3code" \) 2>/dev/null || true)
if [ -n "$strays" ]; then
  echo "$strays" >&2
  violated "upstream-named paths under the scratch HOME" "$scratch"
fi
support="$scratch/Library/Application Support"
if [ ! -d "$support/t3code-fork" ]; then
  echo "Expected Electron user-data directory missing: t3code-fork" >&2
  ls "$support" >&2 || true
  dump_diagnostics
  exit 1
fi
echo "Isolation verified: state under ~/.t3-fork and t3code-fork only."
find "$scratch/.t3-fork" -maxdepth 2
