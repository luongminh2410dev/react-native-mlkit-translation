# Changelog

## Unreleased

### Added

- `translate()` with a shared FIFO queue (one running, up to 32 waiting), `AbortSignal` support, and one native translator reused per language pair.
- `prepareTranslator()` to load a language pair ahead of time, and `releaseTranslator()` to free the translator's memory after queued translations.
- Model management: `downloadModel()` and `downloadModels()` for a list (shared per language, optional Wi-Fi only), `deleteModel()`, `isModelDownloaded()`, `getDownloadedModels()`.
- Model state: `getModelState()`, `subscribeModelState()`, `useModelState()`.
- Enum constants `TranslateLanguage` (59 languages, named like ML Kit's `TranslateLanguage`), `TranslationErrorCode`, and `ModelStatus`, each also a type; plain string values are accepted too.
- `TRANSLATE_LANGUAGES`, `isTranslateLanguage()`, and `TranslationError` with stable codes on Android and iOS.
- TurboModule for Android (Kotlin, ML Kit `translate` 17.0.3) and iOS (Objective-C++, `GoogleMLKit/Translate` 9.0.0, iOS 15.5+).
