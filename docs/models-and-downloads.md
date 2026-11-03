# Models and downloads

## What needs a download

- English (`TranslateLanguage.ENGLISH`) ships with the ML Kit SDK. It is always available and is never downloaded or deleted.
- Every other language has its own model. A translation needs the models of both of its languages: English ↔ Vietnamese needs only the `VIETNAMESE` model, while Japanese → Vietnamese needs `JAPANESE` and `VIETNAMESE`.
- ML Kit translates between two non-English languages through English, which can lower the quality ([Google](https://developers.google.com/ml-kit/language/translation)). On-device translation is intended for casual and simple text; check the quality for your languages.
- Google lists language models at about 30 MB each. Treat this as an order of magnitude, not the exact size of a given model.
- You can keep as many models on the device as you need. Once the models of both languages are there, that pair translates offline. Releasing the translator or restarting the app keeps the model.

## Downloading

```ts
const { FRENCH, JAPANESE, VIETNAMESE } = TranslateLanguage;

await downloadModel(VIETNAMESE, { wifiOnly: true });
await downloadModels([VIETNAMESE, JAPANESE, FRENCH], { wifiOnly: true }); // several at once
```

`downloadModels()` starts every download at once, waits for all members to settle, and rejects with the first failure in deduplicated input order; each language's model state tells which ones failed. Deleting one member contributes `ABORTED` but does not stop the batch waiting for the others or override an earlier input member's failure. Abort the batch signal to stop waiting immediately.

| Behavior | Detail |
| --- | --- |
| Default network | Any network (`wifiOnly: false`), as in the SDK. Pass `wifiOnly: true` unless the user agreed to use mobile data. |
| `wifiOnly: true` | The SDK waits for an unmetered network; the promise stays pending and the status stays `ModelStatus.DOWNLOADING` meanwhile. |
| Concurrent calls | Calls for the same language share the download in flight and its network condition: a later `wifiOnly: false` call does not switch a waiting Wi-Fi download to mobile data. |
| Other languages | Downloads of different languages are independent. |
| Translations | Downloads never enter the translation queue; translations of other models keep running. |
| Progress | Not reported: the status is `ModelStatus.DOWNLOADING` until it resolves or rejects. |
| Cancelling | `signal` stops one caller waiting (`ABORTED`) while the download goes on. `deleteModel()` cancels it for every caller, including one waiting for Wi-Fi; see [below](#cancelling-a-download). |
| Failure | Rejects `TranslationErrorCode.MODEL_DOWNLOAD_FAILED`; the status becomes `ModelStatus.FAILED` with the error. There is no automatic retry; the next call starts a new attempt. |
| Already on the device | Checked first: resolves without downloading, and the status never shows `ModelStatus.DOWNLOADING`. A model on the device is not updated; delete it and download it again to get a newer version. |
| iOS signing | ML Kit downloads through a background `URLSession`, which needs a signed app. An unsigned build (for example `CODE_SIGNING_ALLOWED=NO`) gets `MODEL_DOWNLOAD_FAILED` right away; simulator builds with the default ad-hoc signing work. |
| App in the background | iOS: downloads use a background `URLSession` (`allowsBackgroundDownloading`); in an iOS 18.6 simulator check, a model downloaded while the app was in the background was installed within a second of returning to the foreground. Android: ML Kit downloads through the system `DownloadManager`, outside the app process; in an API 36 emulator check, a download started in the foreground finished while the app was in the background. The promise settles when the app runs again. |
| App killed | The OS may stop a pending download, and its promise is lost with the JS runtime; call `downloadModel()` again on the next launch or foreground (a model already on the device resolves at once). |

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

## Cancelling a download

ML Kit documents no way to stop a started download. The package gives two ways out:

```ts
const controller = new AbortController();
downloadModel(TranslateLanguage.KOREAN, { wifiOnly: true, signal: controller.signal }).catch((error) => {
  // ABORTED after abort() or deleteModel(), otherwise MODEL_DOWNLOAD_FAILED
});

// The screen goes away: stop waiting, keep downloading for later.
controller.abort();

// The user taps "Cancel download": stop it for everyone and keep nothing.
await deleteModel(TranslateLanguage.KOREAN);
```

`deleteModel()` rejects single-model callers of that download with `ABORTED` immediately; a batch still waits for its other members. Deletion waits for queued translations and the native delete operation, without waiting for the cancelled download. If ML Kit still finishes the download later, the package deletes the model again, unless the app asked for that language since. Until the network allows it, a Wi-Fi-only download that was cancelled this way still waits in ML Kit and may use Wi-Fi later.

## Checking and deleting

- `isModelDownloaded(language)` and `getDownloadedModels()` read the device and update the [model state](api-reference.md#getmodelstate).
- `useModelState(language)` checks once while the status is still `ModelStatus.UNKNOWN`.
- `deleteModel(language)` cancels a download of that language in flight, waits for queued translations, releases the translator, then deletes the model. Translations that need it then reject `MODEL_NOT_DOWNLOADED`.

Keep only the models the app needs: each one takes storage.
