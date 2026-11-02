# Testing with Jest

The package ships untranspiled source. Jest setups based on the React Native preset do not transform `node_modules` packages outside their allow list, so either add the package to `transformIgnorePatterns`:

```js
transformIgnorePatterns: [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-mlkit-translation)/)',
],
```

Without a native module in Jest, every native call rejects `NATIVE_UNAVAILABLE`; importing the package does not fail.

Or mock it:

```js
jest.mock('react-native-mlkit-translation', () => {
  class TranslationError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'TranslationError';
      this.code = code;
    }
  }
  return {
    TranslationError,
    TRANSLATE_LANGUAGES: ['en', 'vi'],
    isTranslateLanguage: (value) => value === 'en' || value === 'vi',
    translate: jest.fn(async ({ text }) => text),
    prepareTranslator: jest.fn(async () => {}),
    releaseTranslator: jest.fn(async () => {}),
    downloadModel: jest.fn(async () => {}),
    downloadModels: jest.fn(async () => {}),
    deleteModel: jest.fn(async () => {}),
    isModelDownloaded: jest.fn(async () => true),
    getDownloadedModels: jest.fn(async () => ['en', 'vi']),
    getModelState: jest.fn(() => ({ status: 'downloaded', error: null })),
    subscribeModelState: jest.fn(() => () => {}),
    useModelState: jest.fn(() => ({ status: 'downloaded', error: null })),
  };
});
```
