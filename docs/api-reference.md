# API reference

All exports are typed in [`src/index.d.ts`](../src/index.d.ts). Every function rejects (or throws) a [`TranslationError`](#translationerror).

| Export | Returns |
| --- | --- |
| [`translate()`](#translate) | `Promise<string>` |
| [`prepareTranslator()`](#preparetranslator) | `Promise<void>` |
| [`releaseTranslator()`](#releasetranslator) | `Promise<void>` |
| [`downloadModel()`](#downloadmodel) | `Promise<void>` |
| [`downloadModels()`](#downloadmodels) | `Promise<void>` |
| [`deleteModel()`](#deletemodel) | `Promise<void>` |
| [`isModelDownloaded()`](#ismodeldownloaded) | `Promise<boolean>` |
| [`getDownloadedModels()`](#getdownloadedmodels) | `Promise<TranslateLanguage[]>` |
| [`getModelState()`](#getmodelstate) | `ModelState` |
| [`subscribeModelState()`](#subscribemodelstate) | `() => void` |
| [`useModelState()`](#usemodelstate) | `ModelState` |
| [`TRANSLATE_LANGUAGES`](#translate_languages) | `readonly TranslateLanguage[]` |
| [`isTranslateLanguage()`](#istranslatelanguage) | `value is TranslateLanguage` |
| [`TranslationError`](#translationerror) | error class |

## Translation

### `translate()`

```ts
translate(request: {
  text: string;
  from: TranslateLanguage;
  to: TranslateLanguage;
  signal?: AbortSignal;
}): Promise<string>
```

- Works for any two languages whose models are on the device (`ja → fr` as well as `en → vi`). The native translator switches to the requested pair when needed.
- Runs in the shared FIFO queue: one translation at a time, up to 32 waiting. See [queue and memory](queue-and-memory.md).
- `text` is passed unchanged (no trimming or normalization). Empty or whitespace-only text rejects `INVALID_INPUT`.
- `from === to` resolves `text` without native work.
- Never downloads a model. When `from` or `to` (other than `en`) is not on the device, rejects `MODEL_NOT_DOWNLOADED` and refreshes the [model state](#getmodelstate) of both languages.
- `signal`: aborting a waiting request removes it from the queue; aborting the running one rejects right away and drops the late result. Both reject `ABORTED`.

| Code | When |
| --- | --- |
| `INVALID_INPUT` | `text` is not a string with a non-whitespace character |
| `UNSUPPORTED_LANGUAGE` | `from` or `to` is not in `TRANSLATE_LANGUAGES` |
| `MODEL_NOT_DOWNLOADED` | a needed model is missing |
| `TRANSLATION_FAILED` | ML Kit failed to translate |
| `QUEUE_FULL` | 32 requests are already waiting |
| `ABORTED` | `signal` was aborted |
| `NATIVE_UNAVAILABLE` | the native module is not linked |

### `prepareTranslator()`

```ts
prepareTranslator(pair: { from: TranslateLanguage; to: TranslateLanguage }): Promise<void>
```

Loads the translator for `from → to` so the next translation of that pair skips loading the models (ML Kit loads them on the first translation; this call runs a short warm-up translation and drops its result). Runs in the translation queue like a translation and counts toward its limit. The translator stays loaded until a translation of another pair, `releaseTranslator()`, or `deleteModel()`.

- Never downloads: rejects `MODEL_NOT_DOWNLOADED` when a model is missing.
- `from === to` resolves without native work.
- Rejects `UNSUPPORTED_LANGUAGE`, `TRANSLATION_FAILED`, `QUEUE_FULL`, `NATIVE_UNAVAILABLE`.

### `releaseTranslator()`

```ts
releaseTranslator(): Promise<void>
```

Releases the native translator after every translation requested before this call; translations requested later create a new one. Downloaded models stay on the device. Rejects `NATIVE_UNAVAILABLE` when the module is not linked.

## Models

English (`en`) ships with the SDK: it is always downloaded and is never downloaded or deleted. Every other language needs its model. See [models and downloads](models-and-downloads.md).

### `downloadModel()`

```ts
downloadModel(language: TranslateLanguage, options?: { wifiOnly?: boolean }): Promise<void>
```

- Resolves when the model is on the device; right away for `en` and for a model already downloaded.
- `wifiOnly` (default `false`): wait for an unmetered network. The promise stays pending until then.
- Concurrent calls for the same language share the download in flight, including the first call's `wifiOnly`.
- Downloads do not go through the translation queue and never delay translations.
- Rejects `UNSUPPORTED_LANGUAGE` or `MODEL_DOWNLOAD_FAILED`; the state becomes `failed`. The next call starts a new attempt.

### `downloadModels()`

```ts
downloadModels(languages: readonly TranslateLanguage[], options?: { wifiOnly?: boolean }): Promise<void>
```

Downloads several models, each as [`downloadModel()`](#downloadmodel) does (shared with downloads in flight, same `wifiOnly` for all; duplicates and `en` need no download).

- Validates every code first: rejects `INVALID_INPUT` when `languages` is not an array and `UNSUPPORTED_LANGUAGE` for an unknown code, before any download starts.
- Resolves when every model is on the device; an empty list resolves at once.
- When some downloads fail, waits for the others, then rejects with the first `MODEL_DOWNLOAD_FAILED`. The [model state](#getmodelstate) of each language tells which ones failed; call again to retry them.

### `deleteModel()`

```ts
deleteModel(language: TranslateLanguage): Promise<void>
```

Waits for a download in flight for that language and for queued translations, releases the translator, then deletes the model. No-op for `en`. Rejects `UNSUPPORTED_LANGUAGE` or `MODEL_MANAGER_FAILED`.

### `isModelDownloaded()`

```ts
isModelDownloaded(language: TranslateLanguage): Promise<boolean>
```

Checks the device and updates the model state. `true` for `en` without native work. Rejects `UNSUPPORTED_LANGUAGE` or `MODEL_MANAGER_FAILED`.

### `getDownloadedModels()`

```ts
getDownloadedModels(): Promise<TranslateLanguage[]>
```

Languages whose model is on the device, in alphabetical order, always including `en`. Updates the model state of every language. Rejects `MODEL_MANAGER_FAILED`.

### `getModelState()`

```ts
type ModelStatus = 'unknown' | 'not-downloaded' | 'downloading' | 'downloaded' | 'failed';
type ModelState = { status: ModelStatus; error: TranslationError | null };

getModelState(language: TranslateLanguage): ModelState
```

The last known state, kept in memory for the app session. The returned object is frozen and stays the same until the state changes.

| Status | Meaning |
| --- | --- |
| `unknown` | not checked yet in this session |
| `not-downloaded` | the device does not have the model |
| `downloading` | a download is in flight (it may be waiting for Wi-Fi) |
| `downloaded` | the model is on the device; `en` always |
| `failed` | the last download failed; `error` holds its `TranslationError` |

A check that finds the model missing does not replace `downloading` or `failed`. Throws `UNSUPPORTED_LANGUAGE` for a code outside `TRANSLATE_LANGUAGES`.

### `subscribeModelState()`

```ts
subscribeModelState(listener: (language: TranslateLanguage) => void): () => void
```

Calls `listener` with the language whose state changed. Returns the unsubscribe function.

### `useModelState()`

```ts
useModelState(language: TranslateLanguage): ModelState
```

React hook for `getModelState()`. Re-renders only when that language's state changes. While the state is `unknown`, it checks the device once after mount (a failed check leaves it `unknown`). It never downloads.

## Languages

### `TRANSLATE_LANGUAGES`

The 59 language codes of ML Kit translation, in alphabetical order:

`af` `ar` `be` `bg` `bn` `ca` `cs` `cy` `da` `de` `el` `en` `eo` `es` `et` `fa` `fi` `fr` `ga` `gl` `gu` `he` `hi` `hr` `ht` `hu` `id` `is` `it` `ja` `ka` `kn` `ko` `lt` `lv` `mk` `mr` `ms` `mt` `nl` `no` `pl` `pt` `ro` `ru` `sk` `sl` `sq` `sv` `sw` `ta` `te` `th` `tl` `tr` `uk` `ur` `vi` `zh`

Codes are lowercase language subtags only: `vi`, not `vi-VN` or `VI`. `zh` is Simplified Chinese; `he` is Hebrew; `no` is Norwegian.

### `isTranslateLanguage()`

```ts
isTranslateLanguage(value: unknown): value is TranslateLanguage
```

Type guard for codes from user input, device locale, or a server.

## Errors

### `TranslationError`

```ts
class TranslationError extends Error {
  readonly name: 'TranslationError';
  readonly code: TranslationErrorCode;
  readonly cause?: unknown; // the native error, when there is one
}
```

| Code | Rejected by |
| --- | --- |
| `INVALID_INPUT` | `translate`, `downloadModels` |
| `UNSUPPORTED_LANGUAGE` | every function taking a language |
| `MODEL_NOT_DOWNLOADED` | `translate`, `prepareTranslator` |
| `MODEL_DOWNLOAD_FAILED` | `downloadModel`, `downloadModels` |
| `MODEL_MANAGER_FAILED` | `isModelDownloaded`, `getDownloadedModels`, `deleteModel` |
| `TRANSLATION_FAILED` | `translate`, `prepareTranslator`, `releaseTranslator`, `deleteModel` (releasing first) |
| `QUEUE_FULL` | `translate`, `prepareTranslator` |
| `ABORTED` | `translate` |
| `NATIVE_UNAVAILABLE` | every native call when the module is not linked |

Messages are for logs; show your own text to users based on `code`. The package never logs the translated text.
