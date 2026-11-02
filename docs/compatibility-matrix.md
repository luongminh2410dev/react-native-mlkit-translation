# Compatibility matrix

Requirements: React Native 0.76+ with the New Architecture, React 18+, iOS 15.5+, Android `minSdkVersion` 24+. The Android build uses Java/Kotlin target 17 (JDK 17). Pinned SDKs: `com.google.mlkit:translate` 17.0.3, `GoogleMLKit/Translate` 9.0.0.

Verified with the [example fixtures](../example/README.md) and their on-launch self-test (multi-model download, prepare, pair switches, 10 concurrent callers, abort, `QUEUE_FULL`, delete, release; since 0.1.2 also cancelling a download with `deleteModel()` and `signal`, and a 7,000-character text):

- 0.1.2, 2026-11-03: release builds of `rn-0.88` and `expo-sdk-58` passed the 18-step self-test on an iOS 18.6 simulator (iPhone 16 Pro, arm64, ad-hoc signed). On Android, both fixtures built and the Kotlin unit tests passed; the emulator run was cut short because the test network could not reach Google's model CDN over IPv6, so the new self-test steps ran on iOS only.
- 0.1.1, 2026-11-02: `rn-0.88` release builds passed the 13-step self-test on an Android 16 (API 36, arm64) emulator and an iOS 18.6 simulator.

| Fixture | Android | iOS |
| --- | --- | --- |
| React Native 0.76.x (minimum) | Not verified | Not verified |
| React Native 0.83.x | Not verified | Not verified |
| React Native 0.88.1 (`rn-0.88`) | Build and Kotlin tests (0.1.2); emulator runtime (0.1.1) | Build and simulator runtime (0.1.2) |
| Expo SDK 58, React Native 0.88.1 (`expo-sdk-58`) | Build (0.1.2) | Build and simulator runtime (0.1.2) |

Fixtures for any version can be generated with `example/scripts/create-fixture.sh` (see [example/README.md](../example/README.md)). This table lists only what was built and run. Not yet verified on physical devices.

Known platform limits:

- ML Kit iOS APIs run on 64-bit devices only.
- Expo: development and production builds only, not Expo Go (the package has native code). Install it, then `npx expo prebuild` or `npx expo run:android|ios`; autolinking needs no config plugin. Expo SDK 58 already targets iOS 16.4 and Android API 24. An older SDK whose iOS target is below 15.5 needs `expo-build-properties` with `ios.deploymentTarget: '15.5'` (not verified).
- The Legacy Architecture is not supported.
