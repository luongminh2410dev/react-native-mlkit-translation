// Consumer-side type checks for the published declarations. Run with `npm run typecheck`.
import {
  TRANSLATE_LANGUAGES,
  TranslationError,
  deleteModel,
  downloadModel,
  downloadModels,
  getDownloadedModels,
  getModelState,
  isModelDownloaded,
  isTranslateLanguage,
  prepareTranslator,
  releaseTranslator,
  subscribeModelState,
  translate,
  useModelState,
  type ModelState,
  type ModelStatus,
  type TranslateLanguage,
  type TranslatorPair,
  type TranslationErrorCode
} from 'react-native-mlkit-translation';

async function translateWithAbort(): Promise<string> {
  const controller = new AbortController();
  const result: string = await translate({ text: 'Hello', from: 'en', to: 'vi', signal: controller.signal });
  // @ts-expect-error Region subtags are not ML Kit language codes.
  await translate({ text: 'Hello', from: 'en', to: 'vi-VN' });
  // @ts-expect-error The source language is required.
  await translate({ text: 'Hello', to: 'vi' });
  return result;
}

async function manageModels(): Promise<TranslateLanguage[]> {
  await downloadModel('vi', { wifiOnly: true });
  await downloadModel('ja');
  const downloaded: boolean = await isModelDownloaded('vi');
  await downloadModels(['vi', 'ja', 'fr'], { wifiOnly: true });
  const wanted: readonly TranslateLanguage[] = ['ko', 'zh'];
  await downloadModels(wanted);
  // @ts-expect-error Every entry must be a language code.
  await downloadModels(['vi', 'vi-VN']);
  const pair: TranslatorPair = { from: 'ja', to: 'vi' };
  await prepareTranslator(pair);
  // @ts-expect-error The target language is required.
  await prepareTranslator({ from: 'ja' });
  await deleteModel('ja');
  await releaseTranslator();
  // @ts-expect-error Unknown language code.
  await downloadModel('xx');
  return downloaded ? getDownloadedModels() : [];
}

function fromUserInput(code: string): TranslateLanguage | null {
  // @ts-expect-error A plain string is not a TranslateLanguage until it is checked.
  const unchecked: TranslateLanguage = code;
  return isTranslateLanguage(code) ? code : unchecked && null;
}

const languages: readonly TranslateLanguage[] = TRANSLATE_LANGUAGES;
// @ts-expect-error The language list is read-only.
TRANSLATE_LANGUAGES.push('en');

function describeStatus(status: ModelStatus): string {
  switch (status) {
    case 'unknown':
    case 'not-downloaded':
    case 'downloading':
    case 'downloaded':
    case 'failed':
      return status;
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof TranslationError)) {
    return 'unexpected';
  }
  const code: TranslationErrorCode = error.code;
  switch (code) {
    case 'INVALID_INPUT':
    case 'UNSUPPORTED_LANGUAGE':
    case 'MODEL_NOT_DOWNLOADED':
    case 'MODEL_DOWNLOAD_FAILED':
    case 'MODEL_MANAGER_FAILED':
    case 'TRANSLATION_FAILED':
    case 'QUEUE_FULL':
    case 'ABORTED':
    case 'NATIVE_UNAVAILABLE':
      return code;
  }
}

const state: ModelState = getModelState('vi');
const hookState: ModelState = useModelState('vi');
const failure: TranslationError | null = state.error;
const unsubscribe: () => void = subscribeModelState((language: TranslateLanguage) => {
  describeStatus(getModelState(language).status);
});

export {
  translateWithAbort,
  manageModels,
  fromUserInput,
  languages,
  describeError,
  hookState,
  failure,
  unsubscribe
};
