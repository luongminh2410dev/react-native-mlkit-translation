# Testing with Jest

The package ships untranspiled source. Jest setups based on the React Native preset do not transform `node_modules` packages outside their allow list, so either add the package to `transformIgnorePatterns`:

```js
transformIgnorePatterns: [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-mlkit-translation)/)',
],
```

Without a native module in Jest, every native call rejects `NATIVE_UNAVAILABLE`; importing the package does not fail.

Or mock it. Include the constants your code uses (`TranslateLanguage`, `TranslationErrorCode`, `ModelStatus`); their values are the plain strings:

```js
jest.mock('react-native-mlkit-translation', () => {
  const TranslateLanguage = { ENGLISH: 'en', VIETNAMESE: 'vi' };
  const TranslationErrorCode = { MODEL_NOT_DOWNLOADED: 'MODEL_NOT_DOWNLOADED', ABORTED: 'ABORTED' };
  const ModelStatus = {
    UNKNOWN: 'unknown',
    NOT_DOWNLOADED: 'not-downloaded',
    DOWNLOADING: 'downloading',
    DOWNLOADED: 'downloaded',
    FAILED: 'failed',
  };
  class TranslationError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'TranslationError';
      this.code = code;
    }
  }
  const downloaded = { status: ModelStatus.DOWNLOADED, error: null };
  return {
    TranslateLanguage,
    TranslationErrorCode,
    ModelStatus,
    TranslationError,
    TRANSLATE_LANGUAGES: Object.values(TranslateLanguage),
    isTranslateLanguage: (value) => Object.values(TranslateLanguage).includes(value),
    translate: jest.fn(async ({ text }) => text),
    prepareTranslator: jest.fn(async () => {}),
    releaseTranslator: jest.fn(async () => {}),
    downloadModel: jest.fn(async () => {}),
    downloadModels: jest.fn(async () => {}),
    deleteModel: jest.fn(async () => {}),
    isModelDownloaded: jest.fn(async () => true),
    getDownloadedModels: jest.fn(async () => Object.values(TranslateLanguage)),
    getModelState: jest.fn(() => downloaded),
    subscribeModelState: jest.fn(() => () => {}),
    useModelState: jest.fn(() => downloaded),
  };
});
```
