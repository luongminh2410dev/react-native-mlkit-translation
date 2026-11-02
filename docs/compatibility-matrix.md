# Compatibility matrix

Requirements: React Native 0.76+ with the New Architecture, React 18+, iOS 15.5+, Android `minSdkVersion` 24+. The Android build uses Java/Kotlin target 17 (JDK 17). Pinned SDKs: `com.google.mlkit:translate` 17.0.3, `GoogleMLKit/Translate` 9.0.0.

Verified on 2026-11-02 with the [example fixture](../example/README.md) `rn-0.88` and its on-launch self-test (multi-model download, prepare, pair switches, 10 concurrent callers, abort, `QUEUE_FULL`, delete, release): release builds on an Android 16 (API 36, arm64) emulator and an iOS 18.6 simulator (arm64, ad-hoc signed). Kotlin unit tests pass in the same fixture.

| React Native | Android | iOS |
| --- | --- | --- |
| 0.76.x (minimum) | Not verified | Not verified |
| 0.83.x | Not verified | Not verified |
| 0.88.1 | Build, Kotlin tests, and emulator runtime verified | Build and simulator runtime verified |

Fixtures for any version can be generated with `example/scripts/create-fixture.sh` (see [example/README.md](../example/README.md)). This table lists only what was built and run. Not yet verified on physical devices.

Known platform limits:

- ML Kit iOS APIs run on 64-bit devices only.
- Expo: development and production builds only, not Expo Go. Set the iOS deployment target to 15.5 with `expo-build-properties` (`ios.deploymentTarget`); not verified yet.
- The Legacy Architecture is not supported.
