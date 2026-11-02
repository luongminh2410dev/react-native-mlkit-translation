#!/usr/bin/env bash
# Packs the library from the repository root and installs the tarball plus the shared screen into fixtures.
# Usage: example/scripts/install-library-into-fixtures.sh [fixture-dir ...]   (default: every rn-* and expo-* fixture)
# Run `pod install` in the fixture's ios/ directory afterwards for iOS builds; in an Expo fixture, run
# `npx expo prebuild --clean` instead (it generates android/ and ios/ and installs the pods).
set -euo pipefail

example_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$example_dir/.." && pwd)"
tarball_dir="$example_dir/.tarballs"
tarball="$tarball_dir/react-native-mlkit-translation.tgz"

mkdir -p "$tarball_dir"
packed="$(cd "$repo_dir" && npm pack --ignore-scripts --pack-destination "$tarball_dir" | tail -1)"
mv "$tarball_dir/$packed" "$tarball"

if [ "$#" -eq 0 ]; then
  set -- "$example_dir"/rn-* "$example_dir"/expo-*
fi

for fixture in "$@"; do
  [ -f "$fixture/package.json" ] || continue
  echo "Installing into $fixture"
  # npm skips copying a local package whose version did not change, so remove the previous copies first.
  rm -rf "$fixture/node_modules/react-native-mlkit-translation" "$fixture/node_modules/mlkit-translation-example-shared"
  # install-links copies local packages instead of symlinking them, which Metro may not follow.
  # --no-save keeps the lockfile unchanged: the fixture's package.json already lists both packages (autolinking reads it),
  # and the tarball integrity changes on every pack.
  (cd "$fixture" && npm install --no-save --install-links "file:../.tarballs/react-native-mlkit-translation.tgz" "file:../shared")
done
