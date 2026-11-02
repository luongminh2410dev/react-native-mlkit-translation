import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { BUILT_IN_LANGUAGE, TRANSLATE_LANGUAGES, TranslateLanguage, isTranslateLanguage } from './languages';
import { ModelStatus, createModelStore } from './model-store';
import { TranslationError, TranslationErrorCode, toTranslationError } from './translation-error';
import { createTranslationQueue } from './translation-queue';

export {
  ModelStatus,
  TRANSLATE_LANGUAGES,
  TranslateLanguage,
  TranslationError,
  TranslationErrorCode,
  isTranslateLanguage
};

const MAX_PENDING_TRANSLATIONS = 32;

/**
 * Resolves the native module through the Codegen spec. Required lazily so importing the package never touches native
 * code.
 */
function getNativeModule() {
  return require('./NativeMLKitTranslation').default;
}

async function callNative(method, args, fallbackCode) {
  const nativeModule = getNativeModule();
  if (!nativeModule || typeof nativeModule[method] !== 'function') {
    throw new TranslationError(TranslationErrorCode.NATIVE_UNAVAILABLE);
  }
  try {
    return await nativeModule[method](...args);
  } catch (error) {
    throw toTranslationError(error, fallbackCode);
  }
}

const queue = createTranslationQueue({ maxPending: MAX_PENDING_TRANSLATIONS });
const store = createModelStore(callNative, {
  removeOrphan: (language, isStillOrphan) =>
    queue.enqueueBarrier(() => (isStillOrphan() ? removeFromDevice(language) : undefined))
});

function assertLanguage(language) {
  if (!isTranslateLanguage(language)) {
    throw new TranslationError(
      TranslationErrorCode.UNSUPPORTED_LANGUAGE,
      `'${String(language)}' is not an ML Kit translation language.`
    );
  }
}

/** Runs `operation` after validating `language`, turning a validation error into a rejection. */
function withLanguage(language, operation) {
  try {
    assertLanguage(language);
  } catch (error) {
    return Promise.reject(error);
  }
  return operation();
}

/**
 * Settles like `promise`, or rejects `ABORTED` with `message` when `signal` aborts first. The work behind `promise`
 * goes on; only this caller stops waiting.
 */
function followWithSignal(promise, signal, message) {
  if (!signal) {
    return promise;
  }
  return new Promise((resolve, reject) => {
    const finish = (settle, value) => {
      signal.removeEventListener('abort', onAbort);
      settle(value);
    };
    const onAbort = () => finish(reject, new TranslationError(TranslationErrorCode.ABORTED, message));
    signal.addEventListener('abort', onAbort);
    promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
}

/** Native call that needs the translator; a missing model refreshes both states so they match the disk. */
function callWithTranslator(method, args, from, to) {
  return callNative(method, args, TranslationErrorCode.TRANSLATION_FAILED).catch((error) => {
    if (error.code === TranslationErrorCode.MODEL_NOT_DOWNLOADED) {
      // Native code does not say which side is missing.
      [from, to].forEach((language) => {
        store.refresh(language).catch(noop);
      });
    }
    throw error;
  });
}

/**
 * Translates `text` from `from` to `to` on the device. Any pair of downloaded languages works; the native translator
 * switches to the requested pair when needed.
 *
 * Requests run one at a time in FIFO order through a single native translator; up to 32 wait behind the running one,
 * more reject with `QUEUE_FULL`. `signal` aborts a waiting request, or rejects a running one with `ABORTED` and drops
 * its late result. The text is passed through unchanged; `from === to` resolves it without native work.
 *
 * Rejects with a {@link TranslationError}: `INVALID_INPUT` for empty or whitespace-only text, `UNSUPPORTED_LANGUAGE`,
 * `MODEL_NOT_DOWNLOADED` when a non-English model is missing (never downloads it), `MODEL_MANAGER_FAILED` when checking
 * the models fails (Android), `TRANSLATION_FAILED`, `QUEUE_FULL`, `ABORTED`, `NATIVE_UNAVAILABLE`.
 */
export function translate(request) {
  const { text, from, to, signal } = request || {};
  try {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new TranslationError(TranslationErrorCode.INVALID_INPUT);
    }
    assertLanguage(from);
    assertLanguage(to);
  } catch (error) {
    return Promise.reject(error);
  }

  if (from === to) {
    return signal && signal.aborted
      ? Promise.reject(new TranslationError(TranslationErrorCode.ABORTED))
      : Promise.resolve(text);
  }

  return queue.enqueue(() => callWithTranslator('translate', [text, from, to], from, to), { signal });
}

/**
 * Loads the translator for `from → to` ahead of time, so the next translation of that pair skips the load. Runs in the
 * translation queue like a translation; the translator stays loaded until another pair is used or
 * {@link releaseTranslator} runs. Never downloads: rejects `MODEL_NOT_DOWNLOADED` when a model is missing.
 * Resolves without native work when `from === to`.
 */
export function prepareTranslator(request) {
  const { from, to } = request || {};
  try {
    assertLanguage(from);
    assertLanguage(to);
  } catch (error) {
    return Promise.reject(error);
  }

  if (from === to) {
    return Promise.resolve();
  }

  return queue.enqueue(() => callWithTranslator('prepareTranslator', [from, to], from, to));
}

/**
 * Releases the native translator and its memory after every translation requested before this call; translations
 * requested later create a new one. Downloaded models stay on disk.
 */
export function releaseTranslator() {
  return queue.enqueueBarrier(() => callNative('releaseTranslator', [], TranslationErrorCode.TRANSLATION_FAILED));
}

/**
 * Whether the model for `language` is on the device. Always `true` for `TranslateLanguage.ENGLISH`. Updates the model
 * state. An answer that arrives after a download of that language finished or its model was deleted is outdated: the
 * current state answers instead.
 */
export function isModelDownloaded(language) {
  return withLanguage(language, () => store.refresh(language));
}

/**
 * Languages whose model is on the device, always including `TranslateLanguage.ENGLISH`. Updates the model state of
 * every language.
 */
export function getDownloadedModels() {
  return store.refreshAll();
}

const DOWNLOAD_ABORTED = 'This call stopped waiting for the download: its signal was aborted.';

/**
 * Downloads the model for `language`. Concurrent calls for the same language share the download in flight, including
 * its network condition. With `wifiOnly: true` the download waits for an unmetered network. Resolves right away for
 * `TranslateLanguage.ENGLISH`. Checks the device first: a model already there resolves without a download and without
 * showing `ModelStatus.DOWNLOADING`. Rejects with `MODEL_DOWNLOAD_FAILED`; a later call starts a new attempt.
 *
 * `signal` stops this caller waiting (`ABORTED`); the download goes on. {@link deleteModel} cancels it for every
 * caller.
 */
export function downloadModel(language, options) {
  const { wifiOnly, signal } = options || {};
  return withLanguage(language, () => {
    if (signal && signal.aborted) {
      return Promise.reject(new TranslationError(TranslationErrorCode.ABORTED, DOWNLOAD_ABORTED));
    }
    return followWithSignal(store.download(language, Boolean(wifiOnly)), signal, DOWNLOAD_ABORTED);
  });
}

/**
 * Downloads the models of several languages at once, each like {@link downloadModel} (shared with downloads in flight,
 * same `wifiOnly` for all). Duplicates and `TranslateLanguage.ENGLISH` need no download. Validates every code before
 * starting any download. Resolves when every model is on the device. When some downloads fail, waits for the others,
 * then rejects with the first failure; each language's model state tells which ones failed. `signal` stops this caller
 * waiting (`ABORTED`); the downloads go on.
 */
export function downloadModels(languages, options) {
  const { wifiOnly, signal } = options || {};
  try {
    if (!Array.isArray(languages)) {
      throw new TranslationError(
        TranslationErrorCode.INVALID_INPUT,
        'downloadModels() expects an array of language codes.'
      );
    }
    languages.forEach(assertLanguage);
    if (signal && signal.aborted) {
      throw new TranslationError(TranslationErrorCode.ABORTED, DOWNLOAD_ABORTED);
    }
  } catch (error) {
    return Promise.reject(error);
  }

  const unique = Array.from(new Set(languages));
  const all = Promise.allSettled(unique.map((language) => store.download(language, Boolean(wifiOnly)))).then(
    (results) => {
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) {
        throw failure.reason;
      }
    }
  );
  return followWithSignal(all, signal, DOWNLOAD_ABORTED);
}

/**
 * Deletes the model for `language` from the device. Cancels a download in flight for that language: its callers reject
 * `ABORTED` right away, and if ML Kit still finishes it (ML Kit offers no way to stop it), the model is removed again
 * unless a new download of that language was requested since. Waits for queued translations, releases the translator,
 * then deletes. Downloads of that language requested afterwards start once the deletion is done. No-op for
 * `TranslateLanguage.ENGLISH`, which ships with the SDK.
 */
export function deleteModel(language) {
  return withLanguage(language, () => {
    if (language === BUILT_IN_LANGUAGE) {
      return Promise.resolve();
    }
    store.cancelDownload(language);
    const removal = queue.enqueueBarrier(() => removeFromDevice(language));
    store.trackRemoval(language, removal);
    return removal;
  });
}

/** Releases the translator, deletes the model, and records it. Runs as a queue barrier. */
async function removeFromDevice(language) {
  await callNative('releaseTranslator', [], TranslationErrorCode.TRANSLATION_FAILED);
  await callNative('deleteModel', [language], TranslationErrorCode.MODEL_MANAGER_FAILED);
  store.markNotDownloaded(language);
}

/**
 * Last known state of the model for `language`: `{ status, error }`. The object stays the same until the state changes.
 * `ModelStatus.UNKNOWN` until a check, download, or translation tells otherwise. Throws `UNSUPPORTED_LANGUAGE` for
 * other codes.
 */
export function getModelState(language) {
  assertLanguage(language);
  return store.getState(language);
}

/**
 * Calls `listener(language)` whenever the model state of a language changes. Returns the unsubscribe function. A
 * listener that throws does not stop the other listeners or the call that changed the state; its error is rethrown
 * from a timer.
 */
export function subscribeModelState(listener) {
  return store.subscribe(listener);
}

/**
 * React hook for {@link getModelState}. Checks the device once when the state is `ModelStatus.UNKNOWN`; a failed check
 * leaves it unknown.
 */
export function useModelState(language) {
  assertLanguage(language);

  const subscribe = useCallback(
    (onChange) =>
      store.subscribe((changed) => {
        if (changed === language) {
          onChange();
        }
      }),
    [language]
  );
  const getSnapshot = useCallback(() => store.getState(language), [language]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (store.getState(language).status === ModelStatus.UNKNOWN) {
      store.refresh(language).catch(noop);
    }
  }, [language]);

  return state;
}

function noop() {}
