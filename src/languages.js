/**
 * Language codes supported by ML Kit on-device translation (`TranslateLanguage` on Android,
 * `MLKTranslateLanguage` on iOS). English ships with the SDK; every other language needs its model downloaded.
 */
export const TRANSLATE_LANGUAGES = Object.freeze([
  'af', 'ar', 'be', 'bg', 'bn', 'ca', 'cs', 'cy', 'da', 'de',
  'el', 'en', 'eo', 'es', 'et', 'fa', 'fi', 'fr', 'ga', 'gl',
  'gu', 'he', 'hi', 'hr', 'ht', 'hu', 'id', 'is', 'it', 'ja',
  'ka', 'kn', 'ko', 'lt', 'lv', 'mk', 'mr', 'ms', 'mt', 'nl',
  'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sv', 'sw',
  'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh'
]);

/** The language bundled with the SDK: always available, never downloaded or deleted. */
export const BUILT_IN_LANGUAGE = 'en';

const LANGUAGE_SET = new Set(TRANSLATE_LANGUAGES);

/** Whether `value` is one of {@link TRANSLATE_LANGUAGES}. */
export function isTranslateLanguage(value) {
  return typeof value === 'string' && LANGUAGE_SET.has(value);
}
