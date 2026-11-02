# Contributing

## Setup

```bash
npm install
```

`.npmrc` sets `legacy-peer-deps=true` so the install does not pull React Native as a peer dependency of the library itself.

## Checks

```bash
npm test -- --runInBand   # Jest, with react-native mocked
npm run lint
npm run typecheck         # consumer type checks and the Codegen spec
npm pack --dry-run --ignore-scripts
```

## Native code

- Codegen spec: `src/NativeMLKitTranslation.ts`. Android extends the generated `NativeMLKitTranslationSpec`; iOS conforms to the generated protocol of the same name.
- Android: `android/src/main/java/com/reactnativemlkittranslation/`. Translator ownership is in `TranslatorSlot.kt` (no Android APIs, covered by JVM tests in `android/src/test/`).
- iOS: `ios/MLKitTranslation.mm`, built through `RNMLKitTranslation.podspec`.
- Keep error codes identical in `src/translation-error.js`, `src/index.d.ts`, the Kotlin module, and the `.mm` file.

Kotlin tests and native builds run inside an example fixture (`example/rn-0.88/`; the Expo fixture `example/expo-sdk-58/` checks the Expo setup), because `android/` and `ios/` are not standalone projects. See [example/README.md](example/README.md).

## Pull requests

Keep the public API in `src/index.js`, `src/index.d.ts`, the README API table, and `docs/api-reference.md` in sync, and add a line to `CHANGELOG.md` under `Unreleased`. Never include translated user text in issues, logs, or test fixtures that come from real users.

## Releasing

1. Update `version` in `package.json` and rename the `Unreleased` heading in `CHANGELOG.md` to that version and date.
2. Merge to `main`.
3. Tag the release commit on `main` and push the tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

The [Release workflow](.github/workflows/release.yml) checks that the tag matches `package.json` and is on `main`, runs the tests, and publishes to npm with provenance. Versions with a prerelease suffix (`0.2.0-beta.1`) go to the `next` dist-tag; others go to `latest`. Publishing uses npm Trusted Publishing: the package's npm settings list this repository's `release.yml` as a trusted publisher, so no npm token is stored in GitHub. The podspec takes its version from `package.json` and its source from the `v<version>` tag.
