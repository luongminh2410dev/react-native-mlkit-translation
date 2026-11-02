# Example fixtures

Each fixture is a minimal app that renders the shared screen in [`shared/TranslationScreen.js`](shared/TranslationScreen.js). On launch it runs the self-test in [`shared/selfTest.js`](shared/selfTest.js): it downloads Vietnamese and Japanese with `downloadModels()`, prepares and switches pairs, checks 10 concurrent callers, abort, `QUEUE_FULL`, invalid input, delete and release against the real native module, and shows ✓/✗ per step (needs network the first time). Afterwards the screen downloads and deletes models (Wi-Fi only or any network), translates with abort, runs 10 concurrent requests, releases the translator (also on background), and shows the model state of the selected languages. It logs events, timings, and error codes — never the text — with the prefix `[MLKitTranslationExample]`.

## Fixtures

| Fixture | React Native | Platforms |
| --- | --- | --- |
| `rn-0.88` (committed) | 0.88.1 | Android + iOS, New Architecture |

It was created with `example/scripts/create-fixture.sh` and keeps its lockfiles (`package-lock.json`, `Podfile.lock`).

## Check another React Native version

Generate a throwaway fixture (React Native 0.76+, Android + iOS) instead of committing one per version:

```bash
example/scripts/create-fixture.sh 0.83.1   # Jupi's version
example/scripts/create-fixture.sh 0.76.9   # minimum supported
```

The script creates `example/generated-rn-<version>/` (git-ignored) with the React Native CLI, renders the shared screen with the self-test, sets the iOS platform to 15.5, adds the `useLibrarySource` Gradle switch, and installs the packed library. It needs network access. The commands below work the same in a generated fixture.

## Install the library into fixtures

Fixtures consume the library as a packed tarball, the same way consumers do. Run this before the first build and after changing the library or the shared screen:

```bash
example/scripts/install-library-into-fixtures.sh            # the committed fixture
example/scripts/install-library-into-fixtures.sh example/generated-rn-0.83.1
```

The script runs `npm pack` at the repository root, then installs the tarball and `example/shared` with `--install-links` (copies instead of symlinks). On iOS, run `pod install` afterwards: it also regenerates the Codegen output when the spec changed.

## Build

Android needs JDK 17 and the Android SDK; iOS needs Xcode 16+ and CocoaPods.

```bash
cd example/rn-0.88/android && ./gradlew assembleRelease
cd example/rn-0.88/ios && pod install && open MLKitTranslationFixture0881.xcworkspace
```

Release builds bundle the JS, so they run without Metro. Keep the iOS app signed (the simulator's default ad-hoc signing is enough): ML Kit downloads models through a background `URLSession`, which fails in an unsigned build (`CODE_SIGNING_ALLOWED=NO`).

## Kotlin unit tests

The tarball does not include `android/src/test`. Build the library from the repository sources instead:

```bash
cd example/rn-0.88/android
./gradlew -PuseLibrarySource=true :react-native-mlkit-translation:testDebugUnitTest
```

## Check on a device

Read the log with `adb logcat -s ReactNativeJS | grep MLKitTranslationExample` (Android) or the Xcode console (iOS); the self-test logs one `selftest` line per step and a final `{"event":"done","passed":…,"failed":…}`. Scenarios the self-test does not cover:

- first download on Wi-Fi; download with Wi-Fi only while on mobile data (stays `ModelStatus.DOWNLOADING`);
- airplane mode with and without the model; relaunch offline after downloading;
- `en → vi → en`, then another pair (translator switch);
- download failure, then retry;
- background while translating, then foreground; JS reload while translating or downloading.
