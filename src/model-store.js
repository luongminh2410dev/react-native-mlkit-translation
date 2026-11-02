import { BUILT_IN_LANGUAGE, TRANSLATE_LANGUAGES } from './languages';
import { TranslationError, TranslationErrorCode } from './translation-error';

/** Values of `ModelState.status`. */
export const ModelStatus = Object.freeze({
  UNKNOWN: 'unknown',
  NOT_DOWNLOADED: 'not-downloaded',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  FAILED: 'failed'
});

const UNKNOWN = Object.freeze({ status: ModelStatus.UNKNOWN, error: null });
const NOT_DOWNLOADED = Object.freeze({ status: ModelStatus.NOT_DOWNLOADED, error: null });
const DOWNLOADING = Object.freeze({ status: ModelStatus.DOWNLOADING, error: null });
const DOWNLOADED = Object.freeze({ status: ModelStatus.DOWNLOADED, error: null });

/**
 * Model state per language, its listeners, and the download, presence check, and removal in flight per language.
 * `callNative(method, args, fallbackCode)` calls the native module and rejects with a TranslationError.
 * `removeOrphan(language, isStillOrphan)` removes the model of a cancelled download that finished anyway; it runs
 * `isStillOrphan()` right before removing. Callers validate language codes before calling into the store.
 *
 * ML Kit documents no way to cancel a download. Cancelling (`cancelDownload`, used by deleteModel) rejects its callers
 * right away and makes the download an orphan: when the native download still finishes, its model is removed again,
 * unless someone asked for that language since.
 */
export function createModelStore(callNative, { removeOrphan } = {}) {
  const states = new Map();
  const listeners = new Set();
  // Download in flight per language: { promise, resolve, reject, cancelled }.
  const downloads = new Map();
  const checks = new Map();
  // Cancelled download per language whose native download may still finish.
  const orphans = new Map();
  // Removal in flight per language; a new download starts after it. Never rejects.
  const removals = new Map();
  // Bumped when a download finishes or a model is deleted: a check started before may answer with the old disk state.
  const generations = new Map();

  function generationOf(language) {
    return generations.get(language) || 0;
  }

  function bumpGeneration(language) {
    generations.set(language, generationOf(language) + 1);
  }

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
    Array.from(listeners).forEach((listener) => {
      try {
        listener(language);
      } catch (error) {
        reportListenerError(error);
      }
    });
  }

  /**
   * Applies a native "is it on disk" answer to a check started at `generation`, without hiding a download in flight or
   * the error of a failed one. Returns whether the model is on the device; an outdated answer is ignored in favor of
   * the current state, and the model of a cancelled download counts as removed.
   */
  function applyPresence(language, downloaded, generation) {
    if (orphans.has(language)) {
      return false;
    }
    if (generation !== generationOf(language)) {
      return getState(language).status === ModelStatus.DOWNLOADED;
    }
    if (downloaded) {
      setState(language, DOWNLOADED);
    } else if (!downloads.has(language) && getState(language).status !== ModelStatus.FAILED) {
      setState(language, NOT_DOWNLOADED);
    }
    return downloaded;
  }

  /** Checks the device; concurrent checks of the same language (for example several hooks mounting) share one call. */
  function refresh(language) {
    if (language === BUILT_IN_LANGUAGE) {
      return Promise.resolve(true);
    }
    const generation = generationOf(language);
    const inFlight = checks.get(language);
    if (inFlight && inFlight.generation === generation) {
      return inFlight.promise;
    }

    const check = { generation, promise: null };
    const forget = () => {
      if (checks.get(language) === check) {
        checks.delete(language);
      }
    };
    check.promise = callNative('isModelDownloaded', [language], TranslationErrorCode.MODEL_MANAGER_FAILED).then(
      (result) => {
        forget();
        return applyPresence(language, result === true, generation);
      },
      (error) => {
        forget();
        throw error;
      }
    );
    checks.set(language, check);
    return check.promise;
  }

  async function refreshAll() {
    const started = new Map(TRANSLATE_LANGUAGES.map((language) => [language, generationOf(language)]));
    const reported = await callNative('getDownloadedModels', [], TranslationErrorCode.MODEL_MANAGER_FAILED);
    const downloaded = new Set(Array.isArray(reported) ? reported : []);
    return TRANSLATE_LANGUAGES.filter(
      (language) =>
        language === BUILT_IN_LANGUAGE || applyPresence(language, downloaded.has(language), started.get(language))
    );
  }

  /**
   * Downloads the model unless the device already has it, so a model on disk never shows as downloading. Starts after
   * a removal of the same language in flight. Calls made while the download runs share it.
   */
  function download(language, wifiOnly) {
    if (language === BUILT_IN_LANGUAGE) {
      return Promise.resolve();
    }
    // A new request keeps the model that a cancelled download of the same language brings.
    orphans.delete(language);
    const inFlight = downloads.get(language);
    if (inFlight) {
      return inFlight.promise;
    }

    const entry = { promise: null, resolve: null, reject: null, cancelled: false };
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    downloads.set(language, entry);
    runDownload(language, wifiOnly, entry).then(
      (onDevice) => finishDownload(language, entry, onDevice),
      (error) => failDownload(language, entry, error)
    );
    return entry.promise;
  }

  /** Resolves whether the model is on the device at the end; `false` only when cancelled before downloading. */
  async function runDownload(language, wifiOnly, entry) {
    await removals.get(language);
    if (entry.cancelled) {
      return false;
    }
    const onDevice = await callNative('isModelDownloaded', [language], TranslationErrorCode.MODEL_MANAGER_FAILED).then(
      (result) => result === true,
      // The download itself tells whether the model can be fetched.
      () => false
    );
    if (onDevice) {
      return true;
    }
    if (entry.cancelled) {
      return false;
    }
    setState(language, DOWNLOADING);
    await callNative('downloadModel', [language, wifiOnly], TranslationErrorCode.MODEL_DOWNLOAD_FAILED);
    return true;
  }

  function finishDownload(language, entry, onDevice) {
    if (entry.cancelled) {
      if (orphans.get(language) === entry) {
        if (onDevice) {
          removeOrphanModel(language, entry);
        } else {
          orphans.delete(language);
        }
      }
      return;
    }
    downloads.delete(language);
    bumpGeneration(language);
    setState(language, DOWNLOADED);
    entry.resolve();
  }

  function failDownload(language, entry, error) {
    if (entry.cancelled) {
      if (orphans.get(language) === entry) {
        orphans.delete(language);
      }
      return;
    }
    downloads.delete(language);
    setState(language, Object.freeze({ status: ModelStatus.FAILED, error }));
    entry.reject(error);
  }

  function removeOrphanModel(language, entry) {
    const isStillOrphan = () => orphans.get(language) === entry;
    const removal = Promise.resolve()
      .then(() => removeOrphan(language, isStillOrphan))
      .then(
        () => true,
        () => false
      )
      .then((removed) => {
        if (!isStillOrphan()) {
          return;
        }
        orphans.delete(language);
        if (!removed) {
          // The model stayed on the device; let the state say so.
          refresh(language).catch(noop);
        }
      });
    trackRemoval(language, removal);
  }

  /**
   * Cancels the download in flight for `language`: its callers reject `ABORTED` now, and the model it may still bring
   * is removed (see createModelStore). No-op without a download in flight.
   */
  function cancelDownload(language) {
    const entry = downloads.get(language);
    if (!entry) {
      return;
    }
    entry.cancelled = true;
    downloads.delete(language);
    orphans.set(language, entry);
    setState(language, NOT_DOWNLOADED);
    entry.reject(new TranslationError(TranslationErrorCode.ABORTED, 'deleteModel() cancelled the download.'));
  }

  /** Makes downloads of `language` requested from now on start after `removal` settles. */
  function trackRemoval(language, removal) {
    const settled = Promise.resolve(removal).then(noop, noop);
    removals.set(language, settled);
    settled.then(() => {
      if (removals.get(language) === settled) {
        removals.delete(language);
      }
    });
  }

  /** Records a deleted model. */
  function markNotDownloaded(language) {
    if (language === BUILT_IN_LANGUAGE) {
      return;
    }
    bumpGeneration(language);
    if (!downloads.has(language)) {
      setState(language, NOT_DOWNLOADED);
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState,
    refresh,
    refreshAll,
    download,
    cancelDownload,
    trackRemoval,
    markNotDownloaded,
    subscribe
  };
}

function noop() {}

/** Rethrows a listener's error outside the store, so the app's error handler still sees it. */
function reportListenerError(error) {
  setTimeout(() => {
    throw error;
  }, 0);
}
