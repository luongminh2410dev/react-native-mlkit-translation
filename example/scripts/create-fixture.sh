#!/usr/bin/env bash
# Generates a throwaway fixture (Android + iOS) for one React Native version (0.76+), rendering example/shared with the
# packed library, like the committed fixtures.
# Usage: example/scripts/create-fixture.sh <react-native-version>   (e.g. 0.76.9, 0.83.1)
# Output: example/generated-rn-<version>/ (git-ignored). Re-running replaces it.
set -euo pipefail

version="${1:?Usage: create-fixture.sh <react-native-version>}"
if ! [[ "$version" =~ ^0\.([0-9]+)\.[0-9]+$ ]] || [ "${BASH_REMATCH[1]}" -lt 76 ]; then
  echo "Expected a React Native version 0.76.0 or later as x.y.z, got '$version'." >&2
  exit 1
fi
example_dir="$(cd "$(dirname "$0")/.." && pwd)"
fixture_dir="$example_dir/generated-rn-$version"
app_name="MLKitTranslationFixture$(echo "$version" | tr -d '.')"

rm -rf "$fixture_dir"
npx --yes @react-native-community/cli@latest init "$app_name" \
  --version "$version" \
  --directory "$fixture_dir" \
  --skip-install \
  --skip-git-init \
  --install-pods false

rm -rf "$fixture_dir/__tests__" "$fixture_dir/jest.config.js" "$fixture_dir/README.md" "$fixture_dir/App.tsx"
# Fixtures are test apps: the self-test runs on launch; the manual controls stay available afterwards.
cat > "$fixture_dir/App.js" <<'APP'
import React from 'react';
import TranslationScreen from 'mlkit-translation-example-shared';

export default function App() {
  return <TranslationScreen autoRunSelfTest />;
}
APP
printf 'install-links=true\n' > "$fixture_dir/.npmrc"

# ML Kit 9 requires iOS 15.5.
sed -i.bak "s/^platform :ios, .*/platform :ios, '15.5'/" "$fixture_dir/ios/Podfile" && rm "$fixture_dir/ios/Podfile.bak"

cat >> "$fixture_dir/android/settings.gradle" <<'GRADLE'

// Fixture-only: `-PuseLibrarySource=true` builds the library from the repository instead of the installed tarball,
// which excludes `android/src/test`. Use it to run `:react-native-mlkit-translation:testDebugUnitTest`.
if (settings.providers.gradleProperty('useLibrarySource').getOrElse('false') == 'true') {
  project(':react-native-mlkit-translation').projectDir = new File(rootDir, '../../../android')
}
GRADLE

# Autolinking reads package.json, so list both local packages there; the install script then packs and installs them.
(cd "$fixture_dir" && npm pkg set \
  "dependencies.react-native-mlkit-translation=file:../.tarballs/react-native-mlkit-translation.tgz" \
  "dependencies.mlkit-translation-example-shared=file:../shared")
"$example_dir/scripts/install-library-into-fixtures.sh" "$fixture_dir"

echo "Fixture ready: $fixture_dir"
echo "Android: cd $fixture_dir/android && ./gradlew assembleRelease"
echo "iOS:     cd $fixture_dir/ios && pod install && open *.xcworkspace"
