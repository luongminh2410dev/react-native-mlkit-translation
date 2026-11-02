# Changelog

## 0.1.2 — 2026-11-03

### Added

- `signal` option for `downloadModel()` and `downloadModels()`: aborting rejects that call with `ABORTED` while the download goes on for other callers.

### Changed

- `deleteModel()` no longer waits for a download of the same language in flight (a Wi-Fi-only download could keep it pending indefinitely). It cancels the download instead: its callers reject `ABORTED`, the model is deleted at once, and if ML Kit still finishes the download, the model is deleted again unless that language was requested since. Downloads requested after `deleteModel()` start once the deletion is done.

### Fixed

- `downloadModel()` and `downloadModels()` check the device first: a model already downloaded resolves without a download and its status no longer flashes `ModelStatus.DOWNLOADING`. Android also checks before calling ML Kit's download, as iOS already did.
- A model check (`isModelDownloaded()`, `getDownloadedModels()`, `useModelState()`) that answers after a download of that language finished or its model was deleted no longer overwrites the newer status.
- A `subscribeModelState()` listener that throws no longer makes `downloadModel()` throw or reject, replaces a download error, or keeps the other listeners (including `useModelState()`) from being notified. Its error is rethrown from a timer.
- Android: when checking the models before a translation fails, `translate()` and `prepareTranslator()` reject `MODEL_MANAGER_FAILED` instead of `TRANSLATION_FAILED`.
- iOS: work already queued when the module is invalidated (for example on a JS reload) no longer settles promises of the old instance.

### Documentation

- README: a Requirements table (React Native 0.76, iOS 15.5, Android API 24) and installation steps per platform; the description says every downloaded language works offline.
- Queue and memory: how to give up on a translation after a delay with an `AbortSignal`.
- Translation between two non-English languages goes through English in ML Kit and can lose quality.
- Cancelling a download, and that `downloadModel()` does not update a model already on the device.
- Downloads while the app is in the background, and translating long text.
- Expo: verified with a committed Expo SDK 58 fixture (`example/expo-sdk-58`); SDK 58 needs no config plugin.

## 0.1.1 — 2026-11-02

### Documentation

- README shows the npm downloads, New Architecture, and TypeScript badges.

## 0.1.0 — 2026-11-02

### Added

- `translate()` with a shared FIFO queue (one running, up to 32 waiting), `AbortSignal` support, and one native translator reused per language pair.
- `prepareTranslator()` to load a language pair ahead of time, and `releaseTranslator()` to free the translator's memory after queued translations.
- Model management: `downloadModel()` and `downloadModels()` for a list (shared per language, optional Wi-Fi only), `deleteModel()`, `isModelDownloaded()`, `getDownloadedModels()`.
- Model state: `getModelState()`, `subscribeModelState()`, `useModelState()`.
- Enum constants `TranslateLanguage` (59 languages, named like ML Kit's `TranslateLanguage`), `TranslationErrorCode`, and `ModelStatus`, each also a type; plain string values are accepted too.
- `TRANSLATE_LANGUAGES`, `isTranslateLanguage()`, and `TranslationError` with stable codes on Android and iOS.
- TurboModule for Android (Kotlin, ML Kit `translate` 17.0.3) and iOS (Objective-C++, `GoogleMLKit/Translate` 9.0.0, iOS 15.5+).
