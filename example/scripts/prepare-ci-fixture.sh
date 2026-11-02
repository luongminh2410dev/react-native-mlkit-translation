#!/usr/bin/env bash
# CI helper for .github/workflows/native-fixtures.yml: installs the packed library into the committed fixture named by
# $FIXTURE, or generates one for $RN_VERSION when $FIXTURE is "generated". Writes the fixture path to $GITHUB_OUTPUT.
set -euo pipefail

example_dir="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$FIXTURE" = "generated" ]; then
  if [ -z "${RN_VERSION:-}" ]; then
    echo "react_native_version is required for a generated fixture" >&2
    exit 1
  fi
  "$example_dir/scripts/create-fixture.sh" "$RN_VERSION"
  echo "dir=example/generated-rn-$RN_VERSION" >> "$GITHUB_OUTPUT"
else
  # Packs the library first: the fixture lockfile references the tarball, so `npm ci` cannot run before it exists.
  "$example_dir/scripts/install-library-into-fixtures.sh" "$example_dir/$FIXTURE"
  echo "dir=example/$FIXTURE" >> "$GITHUB_OUTPUT"
fi
