<div align="center">

# 🌐 react-native-mlkit-translation

**On-device text translation for React Native with Google ML Kit — 59 languages, offline once a model is downloaded.**

[![npm version](https://img.shields.io/npm/v/react-native-mlkit-translation?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-native-mlkit-translation)
[![CI](https://img.shields.io/github/actions/workflow/status/luongminh2410dev/react-native-mlkit-translation/ci.yml?branch=main&label=CI&logo=github)](https://github.com/luongminh2410dev/react-native-mlkit-translation/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-native-mlkit-translation)](LICENSE)
<br />
[![platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-3DDC84)](docs/compatibility-matrix.md)
[![New Architecture](https://img.shields.io/badge/New%20Architecture-TurboModule-61DAFB?logo=react&logoColor=black)](docs/compatibility-matrix.md)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-3178C6?logo=typescript&logoColor=white)](src/index.d.ts)

</div>

## Features

- Translation runs **on the device**; the text is not sent to a server
- Any pair of the [59 ML Kit languages](docs/api-reference.md#translate_languages): download a list of models, then translate between any two of them; English is built in, other models (~30 MB each) download once
- **One translator, one FIFO queue** shared by every caller: each request gets its own result, two translations never run at the same time
- Load a pair ahead of time with `prepareTranslator()`, `AbortSignal` support, downloads shared per language, optional Wi-Fi only
- Model state store with a React hook
- Stable error codes, identical on Android and iOS
- TurboModule (New Architecture) for React Native 0.76+

## Installation

```bash
npm install react-native-mlkit-translation
cd ios && pod install
```

> ⚠️ **Rebuild the app** after installing or upgrading. Not available in Expo Go.

- **iOS:** 15.5 or later (required by ML Kit). Set `platform :ios, '15.5'` (or higher) in the `Podfile`.
- **Android:** `minSdkVersion` 24 or later.
- **Expo:** development builds only; set the iOS deployment target to 15.5 with `expo-build-properties`.

## Usage

```ts
import { downloadModels, prepareTranslator, translate, TranslationError } from 'react-native-mlkit-translation';

await downloadModels(['vi', 'ja', 'fr'], { wifiOnly: true }); // once; English needs no download
await prepareTranslator({ from: 'en', to: 'vi' }); // optional: load the pair you are about to use

try {
  const vi = await translate({ text: 'Be careful, the floor is slippery.', from: 'en', to: 'vi' });
  const fr = await translate({ text: '床が滑りやすい。', from: 'ja', to: 'fr' }); // any downloaded pair
} catch (error) {
  if (error instanceof TranslationError && error.code === 'MODEL_NOT_DOWNLOADED') {
    // ask to download, then retry
  }
}
```

Show the model state and cancel requests that are no longer needed:

```tsx
import { useEffect, useState } from 'react';
import { translate, useModelState } from 'react-native-mlkit-translation';

function Translation({ text }: { text: string }) {
  const model = useModelState('vi'); // { status: 'downloaded' | 'downloading' | …, error }
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (model.status !== 'downloaded') return;
    const controller = new AbortController();
    translate({ text, from: 'en', to: 'vi', signal: controller.signal }).then(setResult, () => {});
    return () => controller.abort();
  }, [text, model.status]);

  return null;
}
```

> Displaying translations requires a Google attribution — see [privacy and attribution](docs/privacy-and-attribution.md).

## API

| Export | Returns |
| --- | --- |
| `translate({ text, from, to, signal? })` | `Promise<string>` |
| `prepareTranslator({ from, to })` | `Promise<void>` — loads that pair's translator ahead of time |
| `releaseTranslator()` | `Promise<void>` — frees the translator's memory, keeps models |
| `downloadModel(language, { wifiOnly? })` | `Promise<void>` |
| `downloadModels(languages, { wifiOnly? })` | `Promise<void>` |
| `deleteModel(language)` | `Promise<void>` |
| `isModelDownloaded(language)` | `Promise<boolean>` |
| `getDownloadedModels()` | `Promise<TranslateLanguage[]>` |
| `getModelState(language)` / `useModelState(language)` | `{ status, error }` |
| `subscribeModelState(listener)` | unsubscribe function |
| `TRANSLATE_LANGUAGES` / `isTranslateLanguage(value)` | language codes / type guard |
| `TranslationError` | error class with a stable `code` |

Full details, errors, and types: [API reference](docs/api-reference.md).

## Documentation

| | |
| --- | --- |
| [API reference](docs/api-reference.md) | Every export, its results and error codes |
| [Models and downloads](docs/models-and-downloads.md) | Download conditions, sharing, storage, offline use |
| [Queue and memory](docs/queue-and-memory.md) | FIFO order, abort, one translator, releasing memory |
| [Privacy and attribution](docs/privacy-and-attribution.md) | Required Google attribution, SDK metrics disclosure |
| [Compatibility matrix](docs/compatibility-matrix.md) | React Native versions and platforms |
| [Testing with Jest](docs/testing-with-jest.md) | Transform or mock the package |
| [Example app](example/README.md) | Shared screen and fixture scripts |
| [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) | |

## Acknowledgments

Development assisted by Codex and Claude. Not affiliated with Google. ML Kit is subject to the [ML Kit terms](https://developers.google.com/ml-kit/terms).

## License

MIT
