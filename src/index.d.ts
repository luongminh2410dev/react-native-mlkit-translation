/** Language codes supported by ML Kit on-device translation. `'en'` ships with the SDK; the others need a model download. */
export type TranslateLanguage =
  | 'af' | 'ar' | 'be' | 'bg' | 'bn' | 'ca' | 'cs' | 'cy' | 'da' | 'de'
  | 'el' | 'en' | 'eo' | 'es' | 'et' | 'fa' | 'fi' | 'fr' | 'ga' | 'gl'
  | 'gu' | 'he' | 'hi' | 'hr' | 'ht' | 'hu' | 'id' | 'is' | 'it' | 'ja'
  | 'ka' | 'kn' | 'ko' | 'lt' | 'lv' | 'mk' | 'mr' | 'ms' | 'mt' | 'nl'
  | 'no' | 'pl' | 'pt' | 'ro' | 'ru' | 'sk' | 'sl' | 'sq' | 'sv' | 'sw'
  | 'ta' | 'te' | 'th' | 'tl' | 'tr' | 'uk' | 'ur' | 'vi' | 'zh';

/** Every {@link TranslateLanguage}, in alphabetical order. */
export declare const TRANSLATE_LANGUAGES: readonly TranslateLanguage[];

/** Whether `value` is a {@link TranslateLanguage}. Use it to validate codes that come from user input or a server. */
export declare function isTranslateLanguage(value: unknown): value is TranslateLanguage;

/**
 * - `INVALID_INPUT`: empty or whitespace-only text, or `downloadModels()` without an array
 * - `UNSUPPORTED_LANGUAGE`: a code outside {@link TRANSLATE_LANGUAGES}
 * - `MODEL_NOT_DOWNLOADED`: a model needed by the translation is not on the device
 * - `MODEL_DOWNLOAD_FAILED`: the download failed
 * - `MODEL_MANAGER_FAILED`: checking, listing, or deleting models failed
 * - `TRANSLATION_FAILED`: the translator failed
 * - `QUEUE_FULL`: 32 translations are already waiting
 * - `ABORTED`: the request's `signal` was aborted
 * - `NATIVE_UNAVAILABLE`: the native module is not linked (rebuild the app; not available in Expo Go)
 */
export type TranslationErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_LANGUAGE'
  | 'MODEL_NOT_DOWNLOADED'
  | 'MODEL_DOWNLOAD_FAILED'
  | 'MODEL_MANAGER_FAILED'
  | 'TRANSLATION_FAILED'
  | 'QUEUE_FULL'
  | 'ABORTED'
  | 'NATIVE_UNAVAILABLE';

/** Error thrown or rejected by every function of this package. `code` is the same on Android and iOS. */
export declare class TranslationError extends Error {
  readonly name: 'TranslationError';
  readonly code: TranslationErrorCode;
  /** The native error, when there is one. */
  readonly cause?: unknown;
  constructor(code: TranslationErrorCode, message?: string, cause?: unknown);
}

/** The part of `AbortSignal` this package uses; any `AbortController().signal` fits. */
export interface TranslationAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export type TranslateRequest = {
  /** Passed to the translator unchanged. Must contain a non-whitespace character. */
  text: string;
  from: TranslateLanguage;
  to: TranslateLanguage;
  /** Aborting rejects the request with `ABORTED`. */
  signal?: TranslationAbortSignal;
};

/**
 * Translates on the device between any two {@link TranslateLanguage} whose models are downloaded, one request at a time
 * in FIFO order. Up to 32 requests wait behind the running one.
 * Never downloads a model: rejects with `MODEL_NOT_DOWNLOADED` when one is missing.
 */
export declare function translate(request: TranslateRequest): Promise<string>;

export type TranslatorPair = {
  from: TranslateLanguage;
  to: TranslateLanguage;
};

/**
 * Loads the translator for `from → to` ahead of time, in the translation queue, so the next translation of that pair
 * skips the load. Never downloads: rejects `MODEL_NOT_DOWNLOADED` when a model is missing.
 */
export declare function prepareTranslator(pair: TranslatorPair): Promise<void>;

/** Releases the native translator after every translation requested before this call. Models stay on disk. */
export declare function releaseTranslator(): Promise<void>;

export type ModelStatus = 'unknown' | 'not-downloaded' | 'downloading' | 'downloaded' | 'failed';

export type ModelState = {
  /** `'failed'`: the last download failed; the model is not on the device. */
  readonly status: ModelStatus;
  /** The download error when `status` is `'failed'`, otherwise `null`. */
  readonly error: TranslationError | null;
};

export type DownloadModelOptions = {
  /** Wait for an unmetered network (Wi-Fi) before downloading. Defaults to `false`. */
  wifiOnly?: boolean;
};

/** Always `true` for `'en'`. */
export declare function isModelDownloaded(language: TranslateLanguage): Promise<boolean>;

/** Languages whose model is on the device, always including `'en'`. */
export declare function getDownloadedModels(): Promise<TranslateLanguage[]>;

/** Concurrent calls for the same language share one download. Resolves right away for `'en'`. */
export declare function downloadModel(language: TranslateLanguage, options?: DownloadModelOptions): Promise<void>;

/**
 * Downloads several models, each shared with a download in flight. Resolves when all are on the device; otherwise
 * rejects with the first failure after the other downloads settle. Rejects `INVALID_INPUT` when `languages` is not an
 * array and `UNSUPPORTED_LANGUAGE` before downloading anything when a code is unknown.
 */
export declare function downloadModels(
  languages: readonly TranslateLanguage[],
  options?: DownloadModelOptions
): Promise<void>;

/** Releases the translator and deletes the model. No-op for `'en'`. */
export declare function deleteModel(language: TranslateLanguage): Promise<void>;

/** Last known model state; the same object until the state changes. Throws `UNSUPPORTED_LANGUAGE` for other codes. */
export declare function getModelState(language: TranslateLanguage): ModelState;

/** Calls `listener` with the language whose model state changed. Returns the unsubscribe function. */
export declare function subscribeModelState(listener: (language: TranslateLanguage) => void): () => void;

/** React hook for {@link getModelState}; checks the device once while the state is `'unknown'`. */
export declare function useModelState(language: TranslateLanguage): ModelState;
