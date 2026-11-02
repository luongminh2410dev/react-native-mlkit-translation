<div align="center">

# 🌐 react-native-mlkit-translation

**On-device text translation for React Native, powered by Google ML Kit.**

Download the language models you need once, then translate between any of them offline — 59 languages supported.

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

- 🔒 **Offline and private** — translation runs on the device; the text never leaves it
- 🌍 **Many languages at once** — download as many of the 59 languages as you need (~30 MB each, English is built in) and translate between any two of them (pairs without English go through English)
- 🚦 **Safe with many callers** — requests run one at a time in order, each caller gets its own result, and requests can be cancelled
- 🧩 **Typed API** — constants for languages, model statuses, and error codes

## Requirements

| | Minimum |
| --- | --- |
| React Native | **0.76**, New Architecture |
| iOS | **15.5** (required by ML Kit) |
| Android | **API 24** (`minSdkVersion`) |
| Expo | Development build, not Expo Go ([setup](docs/compatibility-matrix.md)) |

## Installation

```bash
npm install react-native-mlkit-translation
```

**iOS** — set the deployment target to 15.5 or higher in `ios/Podfile`, then install the pods:

```ruby
platform :ios, '15.5'
```

```bash
cd ios && pod install
```

**Android** — make sure `minSdkVersion` is 24 or higher in `android/build.gradle` (the default since React Native 0.76).

> ⚠️ **Rebuild the app** after installing or upgrading: the JS API needs the native module.

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

// 1. Download every language you need, once. English is built in.
await downloadModels([VIETNAMESE, JAPANESE], { wifiOnly: true });

// 2. Translate between any two of them, offline.
try {
  const vi = await translate({ text: 'Be careful, the floor is slippery.', from: ENGLISH, to: VIETNAMESE });
  const en = await translate({ text: '床が滑りやすいです。', from: JAPANESE, to: ENGLISH });
} catch (error) {
  // 3. Handle errors by code.
  if (error instanceof TranslationError && error.code === TranslationErrorCode.MODEL_NOT_DOWNLOADED) {
    // offer the download, then retry
  }
}
```

> 📌 Apps that show translations must display a [Google attribution](docs/privacy-and-attribution.md).

## API

| Export | Purpose |
| --- | --- |
| `translate()` | Translate text between two downloaded languages |
| `prepareTranslator()` · `releaseTranslator()` | Load a language pair ahead of time · free its memory |
| `downloadModel()` · `downloadModels()` · `deleteModel()` | Download one or several language models · delete one, cancelling its download |
| `isModelDownloaded()` · `getDownloadedModels()` · `getModelState()` · `useModelState()` · `subscribeModelState()` | Check which models are on the device |
| `TranslateLanguage` · `TranslationErrorCode` · `ModelStatus` | Constants for languages, error codes, model statuses |
| `TRANSLATE_LANGUAGES` · `isTranslateLanguage()` · `TranslationError` | All language codes · validate a code · error class |

## Documentation

| | |
| --- | --- |
| [API reference](docs/api-reference.md) | Every export, its results and error codes, React hook example |
| [Models and downloads](docs/models-and-downloads.md) | Wi-Fi only, shared downloads, cancelling, storage, offline use |
| [Queue and memory](docs/queue-and-memory.md) | Request order, cancelling, timeouts, long text, switching pairs, freeing memory |
| [Privacy and attribution](docs/privacy-and-attribution.md) | Required attribution, SDK metrics disclosure |
| [Compatibility matrix](docs/compatibility-matrix.md) | React Native versions, platforms, Expo |
| [Testing with Jest](docs/testing-with-jest.md) | Transform or mock the package |
| [Example app](example/README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) | |

## License

MIT · Not affiliated with Google; ML Kit is subject to the [ML Kit terms](https://developers.google.com/ml-kit/terms). Development assisted by Codex and Claude.
