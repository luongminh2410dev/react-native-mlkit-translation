# Models and downloads

## What needs a download

- English (`TranslateLanguage.ENGLISH`) ships with the ML Kit SDK. It is always available and is never downloaded or deleted.
- Every other language has its own model. A translation needs the models of both of its languages: English ↔ Vietnamese needs only the `VIETNAMESE` model, while Japanese → Vietnamese needs `JAPANESE` and `VIETNAMESE`.
- Google lists language models at about 30 MB each. Treat this as an order of magnitude, not the exact size of a given model.
- Once a model is on the device, translations work offline. Releasing the translator or restarting the app keeps the model.

## Downloading

```ts
const { FRENCH, JAPANESE, VIETNAMESE } = TranslateLanguage;

await downloadModel(VIETNAMESE, { wifiOnly: true });
await downloadModels([VIETNAMESE, JAPANESE, FRENCH], { wifiOnly: true }); // several at once
```

`downloadModels()` starts every download at once, waits for all of them, and rejects with the first failure; each language's model state tells which ones failed.

| Behavior | Detail |
| --- | --- |
| Default network | Any network (`wifiOnly: false`), as in the SDK. Pass `wifiOnly: true` unless the user agreed to use mobile data. |
| `wifiOnly: true` | The SDK waits for an unmetered network; the promise stays pending and the status stays `ModelStatus.DOWNLOADING` meanwhile. |
| Concurrent calls | Calls for the same language share the download in flight and its network condition: a later `wifiOnly: false` call does not switch a waiting Wi-Fi download to mobile data. |
| Other languages | Downloads of different languages are independent. |
| Translations | Downloads never enter the translation queue; translations of other models keep running. |
| Progress | Not reported: the status is `ModelStatus.DOWNLOADING` until it resolves or rejects. |
| Failure | Rejects `TranslationErrorCode.MODEL_DOWNLOAD_FAILED`; the status becomes `ModelStatus.FAILED` with the error. There is no automatic retry; the next call starts a new attempt. |
| Already on the device | Resolves without downloading. |
| iOS signing | ML Kit downloads through a background `URLSession`, which needs a signed app. An unsigned build (for example `CODE_SIGNING_ALLOWED=NO`) gets `MODEL_DOWNLOAD_FAILED` right away; simulator builds with the default ad-hoc signing work. |
| App killed or suspended | The OS may stop a pending download; call `downloadModel()` again on the next launch or foreground. |

`translate()` never downloads. When a model is missing it rejects `MODEL_NOT_DOWNLOADED`, so the app decides when to download (for example on Wi-Fi only, or after asking the user).

A common pattern is to prepare the models the app needs at startup and on foreground, without blocking the UI:

```ts
import { AppState } from 'react-native';
import { downloadModel, TranslateLanguage } from 'react-native-mlkit-translation';

function prepare() {
  downloadModel(TranslateLanguage.VIETNAMESE, { wifiOnly: true }).catch(() => {
    // The status is now ModelStatus.FAILED; the next foreground tries again.
  });
}

prepare();
AppState.addEventListener('change', (state) => state === 'active' && prepare());
```

## Checking and deleting

- `isModelDownloaded(language)` and `getDownloadedModels()` read the device and update the [model state](api-reference.md#getmodelstate).
- `useModelState(language)` checks once while the status is still `ModelStatus.UNKNOWN`.
- `deleteModel(language)` waits for queued translations, releases the translator, then deletes the model. Translations that need it then reject `MODEL_NOT_DOWNLOADED`.

Keep only the models the app needs: each one takes storage.
