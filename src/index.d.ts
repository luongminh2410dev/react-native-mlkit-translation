/**
 * Languages of ML Kit on-device translation, named like `TranslateLanguage` in the ML Kit SDK. Use the constants
 * (`TranslateLanguage.VIETNAMESE`); the plain codes (`'vi'`) are accepted too. English ships with the SDK; the others
 * need a model download.
 */
export declare const TranslateLanguage: {
  readonly AFRIKAANS: 'af';
  readonly ALBANIAN: 'sq';
  readonly ARABIC: 'ar';
  readonly BELARUSIAN: 'be';
  readonly BENGALI: 'bn';
  readonly BULGARIAN: 'bg';
  readonly CATALAN: 'ca';
  readonly CHINESE: 'zh';
  readonly CROATIAN: 'hr';
  readonly CZECH: 'cs';
  readonly DANISH: 'da';
  readonly DUTCH: 'nl';
  readonly ENGLISH: 'en';
  readonly ESPERANTO: 'eo';
  readonly ESTONIAN: 'et';
  readonly FINNISH: 'fi';
  readonly FRENCH: 'fr';
  readonly GALICIAN: 'gl';
  readonly GEORGIAN: 'ka';
  readonly GERMAN: 'de';
  readonly GREEK: 'el';
  readonly GUJARATI: 'gu';
  readonly HAITIAN_CREOLE: 'ht';
  readonly HEBREW: 'he';
  readonly HINDI: 'hi';
  readonly HUNGARIAN: 'hu';
  readonly ICELANDIC: 'is';
  readonly INDONESIAN: 'id';
  readonly IRISH: 'ga';
  readonly ITALIAN: 'it';
  readonly JAPANESE: 'ja';
  readonly KANNADA: 'kn';
  readonly KOREAN: 'ko';
  readonly LATVIAN: 'lv';
  readonly LITHUANIAN: 'lt';
  readonly MACEDONIAN: 'mk';
  readonly MALAY: 'ms';
  readonly MALTESE: 'mt';
  readonly MARATHI: 'mr';
  readonly NORWEGIAN: 'no';
  readonly PERSIAN: 'fa';
  readonly POLISH: 'pl';
  readonly PORTUGUESE: 'pt';
  readonly ROMANIAN: 'ro';
  readonly RUSSIAN: 'ru';
  readonly SLOVAK: 'sk';
  readonly SLOVENIAN: 'sl';
  readonly SPANISH: 'es';
  readonly SWAHILI: 'sw';
  readonly SWEDISH: 'sv';
  readonly TAGALOG: 'tl';
  readonly TAMIL: 'ta';
  readonly TELUGU: 'te';
  readonly THAI: 'th';
  readonly TURKISH: 'tr';
  readonly UKRAINIAN: 'uk';
  readonly URDU: 'ur';
  readonly VIETNAMESE: 'vi';
  readonly WELSH: 'cy';
};

/** A language code of {@link TranslateLanguage}, such as `TranslateLanguage.VIETNAMESE` (`'vi'`). */
export type TranslateLanguage = (typeof TranslateLanguage)[keyof typeof TranslateLanguage];

/** Every {@link TranslateLanguage} code, sorted by code. */
export declare const TRANSLATE_LANGUAGES: readonly TranslateLanguage[];

/** Whether `value` is a {@link TranslateLanguage} code. Use it to validate codes from user input or a server. */
export declare function isTranslateLanguage(value: unknown): value is TranslateLanguage;

/**
 * Codes of {@link TranslationError}, the same on Android and iOS. Compare with the constants:
 * `error.code === TranslationErrorCode.MODEL_NOT_DOWNLOADED`.
 *
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
export declare const TranslationErrorCode: {
  readonly INVALID_INPUT: 'INVALID_INPUT';
  readonly UNSUPPORTED_LANGUAGE: 'UNSUPPORTED_LANGUAGE';
  readonly MODEL_NOT_DOWNLOADED: 'MODEL_NOT_DOWNLOADED';
  readonly MODEL_DOWNLOAD_FAILED: 'MODEL_DOWNLOAD_FAILED';
  readonly MODEL_MANAGER_FAILED: 'MODEL_MANAGER_FAILED';
  readonly TRANSLATION_FAILED: 'TRANSLATION_FAILED';
  readonly QUEUE_FULL: 'QUEUE_FULL';
  readonly ABORTED: 'ABORTED';
  readonly NATIVE_UNAVAILABLE: 'NATIVE_UNAVAILABLE';
};

/** A code of {@link TranslationErrorCode}. */
export type TranslationErrorCode = (typeof TranslationErrorCode)[keyof typeof TranslationErrorCode];

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

/** Values of `ModelState.status`. */
export declare const ModelStatus: {
  readonly UNKNOWN: 'unknown';
  readonly NOT_DOWNLOADED: 'not-downloaded';
  readonly DOWNLOADING: 'downloading';
  readonly DOWNLOADED: 'downloaded';
  /** The last download failed; the model is not on the device. */
  readonly FAILED: 'failed';
};

/** A value of {@link ModelStatus}. */
export type ModelStatus = (typeof ModelStatus)[keyof typeof ModelStatus];

export type ModelState = {
  readonly status: ModelStatus;
  /** The download error when `status` is `ModelStatus.FAILED`, otherwise `null`. */
  readonly error: TranslationError | null;
};

export type DownloadModelOptions = {
  /** Wait for an unmetered network (Wi-Fi) before downloading. Defaults to `false`. */
  wifiOnly?: boolean;
};

/** Always `true` for `TranslateLanguage.ENGLISH`. */
export declare function isModelDownloaded(language: TranslateLanguage): Promise<boolean>;

/** Languages whose model is on the device, always including `TranslateLanguage.ENGLISH`. */
export declare function getDownloadedModels(): Promise<TranslateLanguage[]>;

/** Concurrent calls for the same language share one download. Resolves right away for `TranslateLanguage.ENGLISH`. */
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

/** Releases the translator and deletes the model. No-op for `TranslateLanguage.ENGLISH`. */
export declare function deleteModel(language: TranslateLanguage): Promise<void>;

/** Last known model state; the same object until the state changes. Throws `UNSUPPORTED_LANGUAGE` for other codes. */
export declare function getModelState(language: TranslateLanguage): ModelState;

/** Calls `listener` with the language whose model state changed. Returns the unsubscribe function. */
export declare function subscribeModelState(listener: (language: TranslateLanguage) => void): () => void;

/** React hook for {@link getModelState}; checks the device once while the status is `ModelStatus.UNKNOWN`. */
export declare function useModelState(language: TranslateLanguage): ModelState;
