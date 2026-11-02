---
name: public-api-change-safety
description: Use when changing an existing export, return value, error code, default, queue limit, type, native module name, package/autolinking config, podspec, peerDependencies, SDK minimums, ML Kit versions, or published files of this library.
---

# Public API Change Safety

Adapted from the jupi-app `shared-layer-change-safety` skill. In a published library every consumer is outside the repository, so the public surface is the shared layer.

## Public surface

- JS exports in `src/index.js` and their declarations in `src/index.d.ts`.
- Error codes and which call rejects with which code; `TranslationError` shape (`name`, `code`, `cause`).
- Enum constants and their values: `TranslateLanguage` (names and codes), `TranslationErrorCode`, `ModelStatus`, and `TRANSLATE_LANGUAGES`. Renaming or removing a constant key or changing its value is breaking; adding a key is a minor change.
- Behavior consumers depend on: FIFO order, 32 waiting translations, abort semantics, release/delete barriers, `from === to` passthrough, `translate` never downloading, download sharing per language, `wifiOnly` default `false`, `TranslateLanguage.ENGLISH` always downloaded, model state values and transitions, hook refresh-once behavior.
- Codegen spec (`src/NativeMLKitTranslation.ts`), `codegenConfig`, native module name `MLKitTranslation`, Kotlin package/class names used by `react-native.config.js`.
- `package.json`: `name`, `main`, `types`, `files`, `peerDependencies`. Podspec name, iOS deployment target, `GoogleMLKit/Translate` version.
- `android/build.gradle` defaults: `compileSdkVersion`, `minSdkVersion`, Java/Kotlin targets, `com.google.mlkit:translate` version.

Pure additions (a new export, a new optional option, a new constant key) need no separate approval but still need types, docs (README API table and `docs/api-reference.md`), and a minor version bump at release. A new error code that an existing call can now reject with is a behavior change for exhaustive consumers: treat it as at least minor and call it out.

## For existing surface

1. Use graph impact/caller queries first, then read the implementation. Supplement with targeted `rg` across JS, Kotlin, Objective-C++, Gradle, podspec, `react-native.config.js`, `package.json`, `README.md`, and `docs/`; the graph does not model autolinking, Codegen, or string-based native lookup.
2. List what a consumer observes before and after: resolved values, rejection codes, ordering, timing, render count, build requirements (minimum OS, pod/Gradle versions).
3. "Optional parameter", "internal refactor", and "same type signature" are not compatibility evidence. Check defaults and error paths.
4. If behavior is proven unchanged for consumers and the task authorizes the edit, proceed. Report evidence.
5. If observable behavior changes, or impact is uncertain, present the diff, consumer impact, required semver bump (patch / minor / major), and the lowest-risk option. Wait for approval. Prior approval for the same concrete impact remains valid.

Do not bump `version`, publish, tag, or push as part of an API change unless the user asks.

Report: surface changed; files and lookups investigated; behavior preserved or approved; semver impact; checks actually run; remaining uncertainty.
