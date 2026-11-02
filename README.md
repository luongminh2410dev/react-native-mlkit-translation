<div align="center">

# 🌐 react-native-mlkit-translation

**On-device text translation for React Native with Google ML Kit — 59 languages, offline once a model is downloaded.**

[![npm version](https://img.shields.io/npm/v/react-native-mlkit-translation?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-native-mlkit-translation)
[![npm downloads](https://img.shields.io/npm/dm/react-native-mlkit-translation?color=cb3837)](https://www.npmjs.com/package/react-native-mlkit-translation)
[![CI](https://img.shields.io/github/actions/workflow/status/luongminh2410dev/react-native-mlkit-translation/ci.yml?branch=main&label=CI&logo=github)](https://github.com/luongminh2410dev/react-native-mlkit-translation/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-native-mlkit-translation)](LICENSE)
<br />
[![platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-3DDC84)](docs/compatibility-matrix.md)
[![New Architecture](https://img.shields.io/badge/New%20Architecture-TurboModule-61DAFB?logo=react&logoColor=black)](docs/compatibility-matrix.md)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-3178C6?logo=typescript&logoColor=white)](src/index.d.ts)

</div>

## Features

- Runs **on the device**: the text is never sent to a server
- Any pair of the 59 ML Kit languages; English is built in, other models (~30 MB) download once
- One shared translator and FIFO queue: each caller gets its own result, with `AbortSignal` support
- TurboModule for React Native 0.76+ (New Architecture), typed constants for languages, statuses, and error codes

## Installation

```bash
npm install react-native-mlkit-translation
cd ios && pod install
```

Requires iOS 15.5+ (`platform :ios, '15.5'` in the `Podfile`) and Android `minSdkVersion` 24+. Rebuild the app after installing; not available in Expo Go.

## Usage

```ts
import {
  downloadModels,
  translate,
  TranslateLanguage,
  TranslationError,
  TranslationErrorCode,
} from 'react-native-mlkit-translation';

const { ENGLISH, VIETNAMESE, JAPANESE } = TranslateLanguage;

// 1. Download the models you need, once (English needs none).
await downloadModels([VIETNAMESE, JAPANESE], { wifiOnly: true });

// 2. Translate between any two downloaded languages.
try {
  const text = await translate({ text: 'Be careful, the floor is slippery.', from: ENGLISH, to: VIETNAMESE });
} catch (error) {
  // 3. Handle errors by code.
  if (error instanceof TranslationError && error.code === TranslationErrorCode.MODEL_NOT_DOWNLOADED) {
    // offer the download, then retry
  }
}
```

Showing translations requires a [Google attribution](docs/privacy-and-attribution.md).

## API

| Export | Purpose |
| --- | --- |
| `translate()` · `prepareTranslator()` · `releaseTranslator()` | Translate, preload a pair, free memory |
| `downloadModel()` · `downloadModels()` · `deleteModel()` | Manage models |
| `isModelDownloaded()` · `getDownloadedModels()` · `getModelState()` · `useModelState()` · `subscribeModelState()` | Model state |
| `TranslateLanguage` · `TranslationErrorCode` · `ModelStatus` · `TRANSLATE_LANGUAGES` · `isTranslateLanguage()` | Constants and checks |
| `TranslationError` | Error class with a stable `code` |

## Documentation

| | |
| --- | --- |
| [API reference](docs/api-reference.md) | Every export, its results and error codes, React hook example |
| [Models and downloads](docs/models-and-downloads.md) | Wi-Fi only, shared downloads, storage, offline use |
| [Queue and memory](docs/queue-and-memory.md) | FIFO order, abort, one translator, releasing memory |
| [Privacy and attribution](docs/privacy-and-attribution.md) | Required attribution, SDK metrics disclosure |
| [Compatibility matrix](docs/compatibility-matrix.md) | React Native versions, platforms, Expo |
| [Testing with Jest](docs/testing-with-jest.md) | Transform or mock the package |
| [Example app](example/README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) | |

## License

MIT · Not affiliated with Google; ML Kit is subject to the [ML Kit terms](https://developers.google.com/ml-kit/terms). Development assisted by Codex and Claude.
