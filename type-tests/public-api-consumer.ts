// Consumer-side type checks for the published declarations. Run with `npm run typecheck`.
import {
  ModelStatus,
  TRANSLATE_LANGUAGES,
  TranslateLanguage,
  TranslationError,
  TranslationErrorCode,
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
  type TranslatorPair
} from 'react-native-mlkit-translation';

// Constants carry their literal codes and double as types.
const vietnamese: 'vi' = TranslateLanguage.VIETNAMESE;
const haitianCreole: 'ht' = TranslateLanguage.HAITIAN_CREOLE;
const asType: TranslateLanguage = TranslateLanguage.JAPANESE;
const plainCode: TranslateLanguage = 'vi';
// @ts-expect-error Constants are read-only.
TranslateLanguage.VIETNAMESE = 'en';
// @ts-expect-error Unknown constant name.
const unknownConstant = TranslateLanguage.KLINGON;

async function translateWithAbort(): Promise<string> {
  const controller = new AbortController();
  const result: string = await translate({
    text: 'Hello',
    from: TranslateLanguage.ENGLISH,
    to: TranslateLanguage.VIETNAMESE,
    signal: controller.signal
  });
  await translate({ text: 'Hello', from: 'en', to: 'vi' });
  // @ts-expect-error Region subtags are not ML Kit language codes.
  await translate({ text: 'Hello', from: 'en', to: 'vi-VN' });
  // @ts-expect-error The source language is required.
  await translate({ text: 'Hello', to: TranslateLanguage.VIETNAMESE });
  return result;
}

async function manageModels(): Promise<TranslateLanguage[]> {
  await downloadModel(TranslateLanguage.VIETNAMESE, { wifiOnly: true });
  await downloadModel('ja');
  await downloadModels([TranslateLanguage.VIETNAMESE, TranslateLanguage.JAPANESE, TranslateLanguage.FRENCH], {
    wifiOnly: true
  });
  const wanted: readonly TranslateLanguage[] = [TranslateLanguage.KOREAN, 'zh'];
  await downloadModels(wanted);
  // @ts-expect-error Every entry must be a language code.
  await downloadModels([TranslateLanguage.VIETNAMESE, 'vi-VN']);
  const downloaded: boolean = await isModelDownloaded(TranslateLanguage.VIETNAMESE);
  const pair: TranslatorPair = { from: TranslateLanguage.JAPANESE, to: TranslateLanguage.VIETNAMESE };
  await prepareTranslator(pair);
  // @ts-expect-error The target language is required.
  await prepareTranslator({ from: TranslateLanguage.JAPANESE });
  await deleteModel(TranslateLanguage.JAPANESE);
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
TRANSLATE_LANGUAGES.push(TranslateLanguage.ENGLISH);

function describeStatus(status: ModelStatus): string {
  switch (status) {
    case ModelStatus.UNKNOWN:
    case ModelStatus.NOT_DOWNLOADED:
    case ModelStatus.DOWNLOADING:
    case ModelStatus.DOWNLOADED:
    case ModelStatus.FAILED:
      return status;
  }
}

const literalStatus: ModelStatus = 'downloaded';

function describeError(error: unknown): string {
  if (!(error instanceof TranslationError)) {
    return 'unexpected';
  }
  const code: TranslationErrorCode = error.code;
  switch (code) {
    case TranslationErrorCode.INVALID_INPUT:
    case TranslationErrorCode.UNSUPPORTED_LANGUAGE:
    case TranslationErrorCode.MODEL_NOT_DOWNLOADED:
    case TranslationErrorCode.MODEL_DOWNLOAD_FAILED:
    case TranslationErrorCode.MODEL_MANAGER_FAILED:
    case TranslationErrorCode.TRANSLATION_FAILED:
    case TranslationErrorCode.QUEUE_FULL:
    case TranslationErrorCode.ABORTED:
    case TranslationErrorCode.NATIVE_UNAVAILABLE:
      return code;
  }
}

const state: ModelState = getModelState(TranslateLanguage.VIETNAMESE);
const hookState: ModelState = useModelState(TranslateLanguage.VIETNAMESE);
const isReady: boolean = hookState.status === ModelStatus.DOWNLOADED;
const failure: TranslationError | null = state.error;
const unsubscribe: () => void = subscribeModelState((language: TranslateLanguage) => {
  describeStatus(getModelState(language).status);
});

export {
  vietnamese,
  haitianCreole,
  asType,
  plainCode,
  unknownConstant,
  translateWithAbort,
  manageModels,
  fromUserInput,
  languages,
  literalStatus,
  describeError,
  isReady,
  failure,
  unsubscribe
};
