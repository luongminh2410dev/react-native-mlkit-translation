# Example fixtures

Each fixture is a minimal app that renders the shared screen in [`shared/TranslationScreen.js`](shared/TranslationScreen.js). On launch it runs the self-test in [`shared/selfTest.js`](shared/selfTest.js): it downloads Vietnamese and Japanese with `downloadModels()`, prepares and switches pairs, checks 10 concurrent callers, abort, `QUEUE_FULL`, invalid input, delete and release, cancels a download with `deleteModel()` and with a `signal` (French and Korean), and translates a 7,000-character text against the real native module, and shows ✓/✗ per step (needs network the first time). Afterwards the screen downloads and deletes models (Wi-Fi only or any network), translates with abort, runs 10 concurrent requests, releases the translator (also on background), and shows the model state of the selected languages. It logs events, timings, and error codes — never the text — with the prefix `[MLKitTranslationExample]`.

## Fixtures

| Fixture | React Native | Platforms |
| --- | --- | --- |
| `rn-0.88` (committed) | 0.88.1 | Android + iOS, New Architecture |
| `expo-sdk-58` (committed) | 0.88.1 (Expo SDK 58) | Android + iOS, New Architecture, development build |

`rn-0.88` was created with `example/scripts/create-fixture.sh` and keeps its lockfiles (`package-lock.json`, `Podfile.lock`). `expo-sdk-58` was created with `create-expo-app` (blank template) and needs no config plugin: SDK 58 already targets iOS 16.4 and Android API 24. Its `android/` and `ios/` folders are generated, not committed.

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
cd example/rn-0.88/android && ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease
cd example/rn-0.88/ios && pod install && open MLKitTranslationFixture0881.xcworkspace
```

Gradle's JS bundle task ignores changes inside `node_modules`, so after reinstalling the library or the shared screen a plain `assembleRelease` can ship the previous bundle; `--rerun` on the bundle task forces a fresh one. Xcode bundles on every build.

Expo fixture (development build, not Expo Go):

```bash
cd example/expo-sdk-58
npx expo prebuild --clean                          # generates android/ and ios/, installs the pods
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

Release builds bundle the JS, so they run without Metro. Keep the iOS app signed (the simulator's default ad-hoc signing is enough): ML Kit downloads models through a background `URLSession`, which fails in an unsigned build (`CODE_SIGNING_ALLOWED=NO`).

## Kotlin unit tests

The tarball does not include `android/src/test`. Build the library from the repository sources instead:

```bash
cd example/rn-0.88/android
./gradlew -PuseLibrarySource=true :react-native-mlkit-translation:testDebugUnitTest
```

## Native CI

The Native fixtures workflow builds the packed library in both `rn-0.88` and `expo-sdk-58` on Android and iOS for pull requests and pushes to `main` that change `src/`, native code, fixtures, package/lockfile, autolinking, podspec, `.npmrc`, or the native workflow. Kotlin JVM tests run through the RN fixture against repository sources. Each job has a 60-minute limit; superseded automatic runs on the same event/ref are cancelled.

Manual `workflow_dispatch` runs build only the selected fixture, including `generated` with a React Native version. These jobs compile and run JVM tests; they do not launch apps or run the device self-test. Documentation-only changes do not trigger these builds (except changes under `example/`, which is included as a whole).

## Check on a device

Read the log with `adb logcat -s ReactNativeJS | grep MLKitTranslationExample` (Android) or the Xcode console (iOS); the self-test logs one `selftest` line per step and a final `{"event":"done","passed":…,"failed":…}`. Scenarios the self-test does not cover:

- first download on Wi-Fi; download with Wi-Fi only while on mobile data (stays `ModelStatus.DOWNLOADING`), then Delete (cancels the download without waiting for it; deletion still waits for queued translations and native deletion);
- a download while the app is in the background;
- airplane mode with and without the model; relaunch offline after downloading;
- `en → vi → en`, then another pair (translator switch);
- download failure, then retry;
- background while translating, then foreground; JS reload while translating or downloading.
