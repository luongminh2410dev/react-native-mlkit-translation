/**
 * Languages of ML Kit on-device translation, named like `TranslateLanguage` in the ML Kit SDK. Each value is the
 * language code the native SDKs use. English ships with the SDK; every other language needs its model downloaded.
 */
export const TranslateLanguage = Object.freeze({
  AFRIKAANS: 'af',
  ALBANIAN: 'sq',
  ARABIC: 'ar',
  BELARUSIAN: 'be',
  BENGALI: 'bn',
  BULGARIAN: 'bg',
  CATALAN: 'ca',
  CHINESE: 'zh',
  CROATIAN: 'hr',
  CZECH: 'cs',
  DANISH: 'da',
  DUTCH: 'nl',
  ENGLISH: 'en',
  ESPERANTO: 'eo',
  ESTONIAN: 'et',
  FINNISH: 'fi',
  FRENCH: 'fr',
  GALICIAN: 'gl',
  GEORGIAN: 'ka',
  GERMAN: 'de',
  GREEK: 'el',
  GUJARATI: 'gu',
  HAITIAN_CREOLE: 'ht',
  HEBREW: 'he',
  HINDI: 'hi',
  HUNGARIAN: 'hu',
  ICELANDIC: 'is',
  INDONESIAN: 'id',
  IRISH: 'ga',
  ITALIAN: 'it',
  JAPANESE: 'ja',
  KANNADA: 'kn',
  KOREAN: 'ko',
  LATVIAN: 'lv',
  LITHUANIAN: 'lt',
  MACEDONIAN: 'mk',
  MALAY: 'ms',
  MALTESE: 'mt',
  MARATHI: 'mr',
  NORWEGIAN: 'no',
  PERSIAN: 'fa',
  POLISH: 'pl',
  PORTUGUESE: 'pt',
  ROMANIAN: 'ro',
  RUSSIAN: 'ru',
  SLOVAK: 'sk',
  SLOVENIAN: 'sl',
  SPANISH: 'es',
  SWAHILI: 'sw',
  SWEDISH: 'sv',
  TAGALOG: 'tl',
  TAMIL: 'ta',
  TELUGU: 'te',
  THAI: 'th',
  TURKISH: 'tr',
  UKRAINIAN: 'uk',
  URDU: 'ur',
  VIETNAMESE: 'vi',
  WELSH: 'cy'
});

/** Every language code of {@link TranslateLanguage}, sorted by code. */
export const TRANSLATE_LANGUAGES = Object.freeze(Object.values(TranslateLanguage).sort());

/** The language bundled with the SDK: always available, never downloaded or deleted. */
export const BUILT_IN_LANGUAGE = TranslateLanguage.ENGLISH;

const LANGUAGE_SET = new Set(TRANSLATE_LANGUAGES);

/** Whether `value` is one of the {@link TranslateLanguage} codes. */
export function isTranslateLanguage(value) {
  return typeof value === 'string' && LANGUAGE_SET.has(value);
}
