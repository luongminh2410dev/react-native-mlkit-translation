/** Codes of {@link TranslationError}, the same on Android and iOS. */
export const TranslationErrorCode = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  UNSUPPORTED_LANGUAGE: 'UNSUPPORTED_LANGUAGE',
  MODEL_NOT_DOWNLOADED: 'MODEL_NOT_DOWNLOADED',
  MODEL_DOWNLOAD_FAILED: 'MODEL_DOWNLOAD_FAILED',
  MODEL_MANAGER_FAILED: 'MODEL_MANAGER_FAILED',
  TRANSLATION_FAILED: 'TRANSLATION_FAILED',
  QUEUE_FULL: 'QUEUE_FULL',
  ABORTED: 'ABORTED',
  NATIVE_UNAVAILABLE: 'NATIVE_UNAVAILABLE'
});

const DEFAULT_MESSAGES = {
  [TranslationErrorCode.INVALID_INPUT]: 'The text to translate must be a non-empty string.',
  [TranslationErrorCode.UNSUPPORTED_LANGUAGE]: 'The language is not supported by ML Kit translation.',
  [TranslationErrorCode.MODEL_NOT_DOWNLOADED]: 'The language model is not downloaded. Call downloadModel() first.',
  [TranslationErrorCode.MODEL_DOWNLOAD_FAILED]: 'The language model could not be downloaded.',
  [TranslationErrorCode.MODEL_MANAGER_FAILED]: 'The downloaded language models could not be read or changed.',
  [TranslationErrorCode.TRANSLATION_FAILED]: 'The text could not be translated.',
  [TranslationErrorCode.QUEUE_FULL]: 'Too many translations are waiting. Try again later.',
  [TranslationErrorCode.ABORTED]: 'The translation was aborted.',
  [TranslationErrorCode.NATIVE_UNAVAILABLE]:
    "The package 'react-native-mlkit-translation' is not linked. Rebuild the app after installing it " +
    '(run `pod install` on iOS); it does not run in Expo Go.'
};

/** Error with a stable `code`, the same on Android and iOS. */
export class TranslationError extends Error {
  constructor(code, message, cause) {
    super(message || DEFAULT_MESSAGES[code] || code);
    // Keeps `instanceof` working when the host transpiles classes without native subclassing.
    Object.setPrototypeOf(this, TranslationError.prototype);
    this.name = 'TranslationError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Converts a native rejection (or anything thrown) into a {@link TranslationError}. Known codes from native code are
 * kept; any other error gets `fallbackCode`.
 */
export function toTranslationError(error, fallbackCode) {
  if (error instanceof TranslationError) {
    return error;
  }

  const nativeCode = error && typeof error.code === 'string' ? error.code : null;
  const code =
    nativeCode && Object.prototype.hasOwnProperty.call(DEFAULT_MESSAGES, nativeCode) ? nativeCode : fallbackCode;
  const message = error && typeof error.message === 'string' && error.message ? error.message : undefined;
  return new TranslationError(code, message, error);
}
