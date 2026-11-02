const DEFAULT_MESSAGES = {
  INVALID_INPUT: 'The text to translate must be a non-empty string.',
  UNSUPPORTED_LANGUAGE: 'The language is not supported by ML Kit translation.',
  MODEL_NOT_DOWNLOADED: 'The language model is not downloaded. Call downloadModel() first.',
  MODEL_DOWNLOAD_FAILED: 'The language model could not be downloaded.',
  MODEL_MANAGER_FAILED: 'The downloaded language models could not be read or changed.',
  TRANSLATION_FAILED: 'The text could not be translated.',
  QUEUE_FULL: 'Too many translations are waiting. Try again later.',
  ABORTED: 'The translation was aborted.',
  NATIVE_UNAVAILABLE:
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
  const code = nativeCode && Object.prototype.hasOwnProperty.call(DEFAULT_MESSAGES, nativeCode) ? nativeCode : fallbackCode;
  const message = error && typeof error.message === 'string' && error.message ? error.message : undefined;
  return new TranslationError(code, message, error);
}
