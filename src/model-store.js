import { BUILT_IN_LANGUAGE, TRANSLATE_LANGUAGES } from './languages';

const UNKNOWN = Object.freeze({ status: 'unknown', error: null });
const NOT_DOWNLOADED = Object.freeze({ status: 'not-downloaded', error: null });
const DOWNLOADING = Object.freeze({ status: 'downloading', error: null });
const DOWNLOADED = Object.freeze({ status: 'downloaded', error: null });

/**
 * Model state per language, its listeners, and the download and presence check in flight per language.
 * `callNative(method, args, fallbackCode)` calls the native module and rejects with a TranslationError.
 * Callers validate language codes before calling into the store.
 */
export function createModelStore(callNative) {
  const states = new Map();
  const listeners = new Set();
  const downloads = new Map();
  const checks = new Map();

  function getState(language) {
    if (language === BUILT_IN_LANGUAGE) {
      return DOWNLOADED;
    }
    return states.get(language) || UNKNOWN;
  }

  function setState(language, next) {
    const previous = getState(language);
    if (previous.status === next.status && previous.error === next.error) {
      return;
    }
    states.set(language, next);
    Array.from(listeners).forEach((listener) => listener(language));
  }

  /** Applies a native "is it on disk" answer without hiding a download in flight or the error of a failed one. */
  function applyPresence(language, downloaded) {
    if (downloaded) {
      setState(language, DOWNLOADED);
      return;
    }
    if (downloads.has(language) || getState(language).status === 'failed') {
      return;
    }
    setState(language, NOT_DOWNLOADED);
  }

  /** Checks the device; concurrent checks of the same language (for example several hooks mounting) share one call. */
  function refresh(language) {
    if (language === BUILT_IN_LANGUAGE) {
      return Promise.resolve(true);
    }
    const inFlight = checks.get(language);
    if (inFlight) {
      return inFlight;
    }

    const promise = callNative('isModelDownloaded', [language], 'MODEL_MANAGER_FAILED').then(
      (result) => {
        checks.delete(language);
        const downloaded = result === true;
        applyPresence(language, downloaded);
        return downloaded;
      },
      (error) => {
        checks.delete(language);
        throw error;
      }
    );
    checks.set(language, promise);
    return promise;
  }

  async function refreshAll() {
    const reported = await callNative('getDownloadedModels', [], 'MODEL_MANAGER_FAILED');
    const downloaded = new Set(Array.isArray(reported) ? reported : []);
    downloaded.add(BUILT_IN_LANGUAGE);
    const languages = TRANSLATE_LANGUAGES.filter((language) => downloaded.has(language));
    TRANSLATE_LANGUAGES.forEach((language) => {
      if (language !== BUILT_IN_LANGUAGE) {
        applyPresence(language, downloaded.has(language));
      }
    });
    return languages;
  }

  function download(language, wifiOnly) {
    if (language === BUILT_IN_LANGUAGE) {
      return Promise.resolve();
    }
    const inFlight = downloads.get(language);
    if (inFlight) {
      return inFlight;
    }

    const promise = callNative('downloadModel', [language, wifiOnly], 'MODEL_DOWNLOAD_FAILED').then(
      () => {
        downloads.delete(language);
        setState(language, DOWNLOADED);
      },
      (error) => {
        downloads.delete(language);
        setState(language, Object.freeze({ status: 'failed', error }));
        throw error;
      }
    );
    downloads.set(language, promise);
    setState(language, DOWNLOADING);
    return promise;
  }

  /** Resolves when the download in flight for `language` settles, or right away when there is none. */
  function waitForDownload(language) {
    const inFlight = downloads.get(language);
    return inFlight ? inFlight.then(noop, noop) : Promise.resolve();
  }

  function markNotDownloaded(language) {
    if (language !== BUILT_IN_LANGUAGE && !downloads.has(language)) {
      setState(language, NOT_DOWNLOADED);
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { getState, refresh, refreshAll, download, waitForDownload, markNotDownloaded, subscribe };
}

function noop() {}
