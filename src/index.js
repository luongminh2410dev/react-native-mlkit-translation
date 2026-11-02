import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { BUILT_IN_LANGUAGE, TRANSLATE_LANGUAGES, isTranslateLanguage } from './languages';
import { createModelStore } from './model-store';
import { TranslationError, toTranslationError } from './translation-error';
import { createTranslationQueue } from './translation-queue';

export { TRANSLATE_LANGUAGES, isTranslateLanguage, TranslationError };

const MAX_PENDING_TRANSLATIONS = 32;

/** Resolves the native module through the Codegen spec. Required lazily so importing the package never touches native code. */
function getNativeModule() {
  return require('./NativeMLKitTranslation').default;
}

async function callNative(method, args, fallbackCode) {
  const nativeModule = getNativeModule();
  if (!nativeModule || typeof nativeModule[method] !== 'function') {
    throw new TranslationError('NATIVE_UNAVAILABLE');
  }
  try {
    return await nativeModule[method](...args);
  } catch (error) {
    throw toTranslationError(error, fallbackCode);
  }
}

const queue = createTranslationQueue({ maxPending: MAX_PENDING_TRANSLATIONS });
const store = createModelStore(callNative);

function assertLanguage(language) {
  if (!isTranslateLanguage(language)) {
    throw new TranslationError('UNSUPPORTED_LANGUAGE', `'${String(language)}' is not an ML Kit translation language.`);
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

/** Native call that needs the translator; a missing model refreshes both states so they match the disk. */
function callWithTranslator(method, args, from, to) {
  return callNative(method, args, 'TRANSLATION_FAILED').catch((error) => {
    if (error.code === 'MODEL_NOT_DOWNLOADED') {
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
 * `MODEL_NOT_DOWNLOADED` when a non-English model is missing (never downloads it), `TRANSLATION_FAILED`, `QUEUE_FULL`,
 * `ABORTED`, `NATIVE_UNAVAILABLE`.
 */
export function translate(request) {
  const { text, from, to, signal } = request || {};
  try {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new TranslationError('INVALID_INPUT');
    }
    assertLanguage(from);
    assertLanguage(to);
  } catch (error) {
    return Promise.reject(error);
  }

  if (from === to) {
    return signal && signal.aborted ? Promise.reject(new TranslationError('ABORTED')) : Promise.resolve(text);
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
  return queue.enqueueBarrier(() => callNative('releaseTranslator', [], 'TRANSLATION_FAILED'));
}

/** Whether the model for `language` is on the device. Always `true` for `'en'`. Updates the model state. */
export function isModelDownloaded(language) {
  return withLanguage(language, () => store.refresh(language));
}

/** Languages whose model is on the device, always including `'en'`. Updates the model state of every language. */
export function getDownloadedModels() {
  return store.refreshAll();
}

/**
 * Downloads the model for `language`. Concurrent calls for the same language share the download in flight, including its
 * network condition. With `wifiOnly: true` the download waits for an unmetered network. Resolves right away for `'en'`
 * and for a model already on the device. Rejects with `MODEL_DOWNLOAD_FAILED`; a later call starts a new attempt.
 */
export function downloadModel(language, options) {
  const wifiOnly = Boolean(options && options.wifiOnly);
  return withLanguage(language, () => store.download(language, wifiOnly));
}

/**
 * Downloads the models of several languages at once, each like {@link downloadModel} (shared with downloads in flight,
 * same `wifiOnly` for all). Duplicates and `'en'` need no download. Validates every code before starting any download.
 * Resolves when every model is on the device. When some downloads fail, waits for the others, then rejects with the
 * first failure; each language's model state tells which ones failed.
 */
export function downloadModels(languages, options) {
  const wifiOnly = Boolean(options && options.wifiOnly);
  try {
    if (!Array.isArray(languages)) {
      throw new TranslationError('INVALID_INPUT', 'downloadModels() expects an array of language codes.');
    }
    languages.forEach(assertLanguage);
  } catch (error) {
    return Promise.reject(error);
  }

  const unique = Array.from(new Set(languages));
  return Promise.allSettled(unique.map((language) => store.download(language, wifiOnly))).then((results) => {
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }
  });
}

/**
 * Deletes the model for `language` from the device. Waits for a download in flight for that language and for queued
 * translations, releases the translator, then deletes. No-op for `'en'`, which ships with the SDK.
 */
export function deleteModel(language) {
  return withLanguage(language, () => {
    if (language === BUILT_IN_LANGUAGE) {
      return Promise.resolve();
    }
    return store.waitForDownload(language).then(() =>
      queue.enqueueBarrier(async () => {
        await callNative('releaseTranslator', [], 'TRANSLATION_FAILED');
        await callNative('deleteModel', [language], 'MODEL_MANAGER_FAILED');
        store.markNotDownloaded(language);
      })
    );
  });
}

/**
 * Last known state of the model for `language`: `{ status, error }`. The object stays the same until the state changes.
 * `'unknown'` until a check, download, or translation tells otherwise. Throws `UNSUPPORTED_LANGUAGE` for other codes.
 */
export function getModelState(language) {
  assertLanguage(language);
  return store.getState(language);
}

/** Calls `listener(language)` whenever the model state of a language changes. Returns the unsubscribe function. */
export function subscribeModelState(listener) {
  return store.subscribe(listener);
}

/**
 * React hook for {@link getModelState}. Checks the device once when the state is `'unknown'`; a failed check leaves it
 * `'unknown'`.
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
    if (store.getState(language).status === 'unknown') {
      store.refresh(language).catch(noop);
    }
  }, [language]);

  return state;
}

function noop() {}
