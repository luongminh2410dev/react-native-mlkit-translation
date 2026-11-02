# API reference

All exports are typed in [`src/index.d.ts`](../src/index.d.ts). Every function rejects (or throws) a [`TranslationError`](#translationerror).

Use the constants [`TranslateLanguage`](#translatelanguage), [`TranslationErrorCode`](#translationerrorcode), and [`ModelStatus`](#modelstatus) instead of string literals. Each constant also names its type, and its values are the plain strings (`TranslateLanguage.VIETNAMESE === 'vi'`), so codes from a server or storage work without conversion. In this page, an error code written alone (`MODEL_NOT_DOWNLOADED`) is the `TranslationErrorCode` constant of that name.

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
| [`TranslateLanguage`](#translatelanguage) | language constants |
| [`TRANSLATE_LANGUAGES`](#translate_languages) | `readonly TranslateLanguage[]` |
| [`isTranslateLanguage()`](#istranslatelanguage) | `value is TranslateLanguage` |
| [`TranslationError`](#translationerror) | error class |
| [`TranslationErrorCode`](#translationerrorcode) | error code constants |
| [`ModelStatus`](#modelstatus) | model status constants |

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
- Never downloads a model. When `from` or `to` (other than `TranslateLanguage.ENGLISH`) is not on the device, rejects `MODEL_NOT_DOWNLOADED` and refreshes the [model state](#getmodelstate) of both languages.
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

English (`TranslateLanguage.ENGLISH`) ships with the SDK: it is always available and is never downloaded or deleted. Every other language needs its model. See [models and downloads](models-and-downloads.md).

### `downloadModel()`

```ts
downloadModel(language: TranslateLanguage, options?: { wifiOnly?: boolean }): Promise<void>
```

- Resolves when the model is on the device; right away for `TranslateLanguage.ENGLISH` and for a model already downloaded.
- `wifiOnly` (default `false`): wait for an unmetered network. The promise stays pending until then.
- Concurrent calls for the same language share the download in flight, including the first call's `wifiOnly`.
- Downloads do not go through the translation queue and never delay translations.
- Rejects `UNSUPPORTED_LANGUAGE` or `MODEL_DOWNLOAD_FAILED`; the status becomes `ModelStatus.FAILED`. The next call starts a new attempt.

### `downloadModels()`

```ts
downloadModels(languages: readonly TranslateLanguage[], options?: { wifiOnly?: boolean }): Promise<void>
```

Downloads several models, each as [`downloadModel()`](#downloadmodel) does (shared with downloads in flight, same `wifiOnly` for all; duplicates and `TranslateLanguage.ENGLISH` need no download).

- Validates every code first: rejects `INVALID_INPUT` when `languages` is not an array and `UNSUPPORTED_LANGUAGE` for an unknown code, before any download starts.
- Resolves when every model is on the device; an empty list resolves at once.
- When some downloads fail, waits for the others, then rejects with the first `MODEL_DOWNLOAD_FAILED`. The [model state](#getmodelstate) of each language tells which ones failed; call again to retry them.

### `deleteModel()`

```ts
deleteModel(language: TranslateLanguage): Promise<void>
```

Waits for a download in flight for that language and for queued translations, releases the translator, then deletes the model. No-op for `TranslateLanguage.ENGLISH`. Rejects `UNSUPPORTED_LANGUAGE` or `MODEL_MANAGER_FAILED`.

### `isModelDownloaded()`

```ts
isModelDownloaded(language: TranslateLanguage): Promise<boolean>
```

Checks the device and updates the model state. `true` for `TranslateLanguage.ENGLISH` without native work. Rejects `UNSUPPORTED_LANGUAGE` or `MODEL_MANAGER_FAILED`.

### `getDownloadedModels()`

```ts
getDownloadedModels(): Promise<TranslateLanguage[]>
```

Languages whose model is on the device, in alphabetical order, always including `TranslateLanguage.ENGLISH`. Updates the model state of every language. Rejects `MODEL_MANAGER_FAILED`.

### `getModelState()`

```ts
type ModelState = { status: ModelStatus; error: TranslationError | null };

getModelState(language: TranslateLanguage): ModelState
```

The last known state, kept in memory for the app session. The returned object is frozen and stays the same until the state changes.

`status` is one of the [`ModelStatus`](#modelstatus) values. A check that finds the model missing does not replace `ModelStatus.DOWNLOADING` or `ModelStatus.FAILED`. Throws `UNSUPPORTED_LANGUAGE` for a code outside `TRANSLATE_LANGUAGES`.

### `ModelStatus`

```ts
if (getModelState(TranslateLanguage.VIETNAMESE).status === ModelStatus.DOWNLOADED) {
  // ready offline
}
```

| Constant | Value | Meaning |
| --- | --- | --- |
| `ModelStatus.UNKNOWN` | `'unknown'` | not checked yet in this session |
| `ModelStatus.NOT_DOWNLOADED` | `'not-downloaded'` | the device does not have the model |
| `ModelStatus.DOWNLOADING` | `'downloading'` | a download is in flight (it may be waiting for Wi-Fi) |
| `ModelStatus.DOWNLOADED` | `'downloaded'` | the model is on the device; English always |
| `ModelStatus.FAILED` | `'failed'` | the last download failed; `error` holds its `TranslationError` |

### `subscribeModelState()`

```ts
subscribeModelState(listener: (language: TranslateLanguage) => void): () => void
```

Calls `listener` with the language whose state changed. Returns the unsubscribe function.

### `useModelState()`

```ts
useModelState(language: TranslateLanguage): ModelState
```

React hook for `getModelState()`. Re-renders only when that language's state changes. While the status is `ModelStatus.UNKNOWN`, it checks the device once after mount (a failed check leaves it unknown). It never downloads.

Translate once the model is ready, and abort when the text changes or the component unmounts:

```tsx
import { useEffect, useState } from 'react';
import { ModelStatus, TranslateLanguage, translate, useModelState } from 'react-native-mlkit-translation';

function Translation({ text }: { text: string }) {
  const model = useModelState(TranslateLanguage.VIETNAMESE);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (model.status !== ModelStatus.DOWNLOADED) return;
    const controller = new AbortController();
    translate({
      text,
      from: TranslateLanguage.ENGLISH,
      to: TranslateLanguage.VIETNAMESE,
      signal: controller.signal,
    }).then(setResult, () => {});
    return () => controller.abort();
  }, [text, model.status]);

  return null;
}
```

## Languages

### `TranslateLanguage`

Constants for the 59 languages of ML Kit translation, named like `TranslateLanguage` in the ML Kit SDK. `TranslateLanguage` is also the type of a language code.

```ts
import { TranslateLanguage } from 'react-native-mlkit-translation';

translate({ text, from: TranslateLanguage.ENGLISH, to: TranslateLanguage.VIETNAMESE });
const target: TranslateLanguage = TranslateLanguage.JAPANESE;
```

| Constant | Code |
| --- | --- |
| `TranslateLanguage.AFRIKAANS` | `af` |
| `TranslateLanguage.ALBANIAN` | `sq` |
| `TranslateLanguage.ARABIC` | `ar` |
| `TranslateLanguage.BELARUSIAN` | `be` |
| `TranslateLanguage.BENGALI` | `bn` |
| `TranslateLanguage.BULGARIAN` | `bg` |
| `TranslateLanguage.CATALAN` | `ca` |
| `TranslateLanguage.CHINESE` | `zh` |
| `TranslateLanguage.CROATIAN` | `hr` |
| `TranslateLanguage.CZECH` | `cs` |
| `TranslateLanguage.DANISH` | `da` |
| `TranslateLanguage.DUTCH` | `nl` |
| `TranslateLanguage.ENGLISH` | `en` |
| `TranslateLanguage.ESPERANTO` | `eo` |
| `TranslateLanguage.ESTONIAN` | `et` |
| `TranslateLanguage.FINNISH` | `fi` |
| `TranslateLanguage.FRENCH` | `fr` |
| `TranslateLanguage.GALICIAN` | `gl` |
| `TranslateLanguage.GEORGIAN` | `ka` |
| `TranslateLanguage.GERMAN` | `de` |
| `TranslateLanguage.GREEK` | `el` |
| `TranslateLanguage.GUJARATI` | `gu` |
| `TranslateLanguage.HAITIAN_CREOLE` | `ht` |
| `TranslateLanguage.HEBREW` | `he` |
| `TranslateLanguage.HINDI` | `hi` |
| `TranslateLanguage.HUNGARIAN` | `hu` |
| `TranslateLanguage.ICELANDIC` | `is` |
| `TranslateLanguage.INDONESIAN` | `id` |
| `TranslateLanguage.IRISH` | `ga` |
| `TranslateLanguage.ITALIAN` | `it` |
| `TranslateLanguage.JAPANESE` | `ja` |
| `TranslateLanguage.KANNADA` | `kn` |
| `TranslateLanguage.KOREAN` | `ko` |
| `TranslateLanguage.LATVIAN` | `lv` |
| `TranslateLanguage.LITHUANIAN` | `lt` |
| `TranslateLanguage.MACEDONIAN` | `mk` |
| `TranslateLanguage.MALAY` | `ms` |
| `TranslateLanguage.MALTESE` | `mt` |
| `TranslateLanguage.MARATHI` | `mr` |
| `TranslateLanguage.NORWEGIAN` | `no` |
| `TranslateLanguage.PERSIAN` | `fa` |
| `TranslateLanguage.POLISH` | `pl` |
| `TranslateLanguage.PORTUGUESE` | `pt` |
| `TranslateLanguage.ROMANIAN` | `ro` |
| `TranslateLanguage.RUSSIAN` | `ru` |
| `TranslateLanguage.SLOVAK` | `sk` |
| `TranslateLanguage.SLOVENIAN` | `sl` |
| `TranslateLanguage.SPANISH` | `es` |
| `TranslateLanguage.SWAHILI` | `sw` |
| `TranslateLanguage.SWEDISH` | `sv` |
| `TranslateLanguage.TAGALOG` | `tl` |
| `TranslateLanguage.TAMIL` | `ta` |
| `TranslateLanguage.TELUGU` | `te` |
| `TranslateLanguage.THAI` | `th` |
| `TranslateLanguage.TURKISH` | `tr` |
| `TranslateLanguage.UKRAINIAN` | `uk` |
| `TranslateLanguage.URDU` | `ur` |
| `TranslateLanguage.VIETNAMESE` | `vi` |
| `TranslateLanguage.WELSH` | `cy` |

Each value is a lowercase language subtag (`TranslateLanguage.VIETNAMESE === 'vi'`); region tags such as `'vi-VN'` and uppercase codes are rejected with `UNSUPPORTED_LANGUAGE`. `CHINESE` is Simplified Chinese. English ships with the SDK; every other language needs its model.

### `TRANSLATE_LANGUAGES`

Every code of `TranslateLanguage`, sorted by code, for pickers or validation.

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

Compare `code` with the [`TranslationErrorCode`](#translationerrorcode) constants:

```ts
try {
  await translate({ text, from: TranslateLanguage.ENGLISH, to: TranslateLanguage.VIETNAMESE });
} catch (error) {
  if (error instanceof TranslationError && error.code === TranslationErrorCode.MODEL_NOT_DOWNLOADED) {
    // offer the download
  }
}
```

### `TranslationErrorCode`

Each constant's value is its name (`TranslationErrorCode.QUEUE_FULL === 'QUEUE_FULL'`).

| Constant | Rejected by |
| --- | --- |
| `TranslationErrorCode.INVALID_INPUT` | `translate`, `downloadModels` |
| `TranslationErrorCode.UNSUPPORTED_LANGUAGE` | every function taking a language |
| `TranslationErrorCode.MODEL_NOT_DOWNLOADED` | `translate`, `prepareTranslator` |
| `TranslationErrorCode.MODEL_DOWNLOAD_FAILED` | `downloadModel`, `downloadModels` |
| `TranslationErrorCode.MODEL_MANAGER_FAILED` | `isModelDownloaded`, `getDownloadedModels`, `deleteModel` |
| `TranslationErrorCode.TRANSLATION_FAILED` | `translate`, `prepareTranslator`, `releaseTranslator`, `deleteModel` (releasing first) |
| `TranslationErrorCode.QUEUE_FULL` | `translate`, `prepareTranslator` |
| `TranslationErrorCode.ABORTED` | `translate` |
| `TranslationErrorCode.NATIVE_UNAVAILABLE` | every native call when the module is not linked |

Messages are for logs; show your own text to users based on `code`. The package never logs the translated text.
