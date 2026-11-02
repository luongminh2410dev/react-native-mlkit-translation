import { createNativeModule, loadLibraryWithMockedReactNative } from './helpers/load-library-with-mocked-react-native';

describe('public constants', () => {
  const { library } = loadLibraryWithMockedReactNative({ nativeModule: createNativeModule() });
  const { ModelStatus, TRANSLATE_LANGUAGES, TranslateLanguage, TranslationError, TranslationErrorCode } = library;

  it('names every ML Kit language once, with the codes of TRANSLATE_LANGUAGES', () => {
    const codes = Object.values(TranslateLanguage);

    expect(codes).toHaveLength(59);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...TRANSLATE_LANGUAGES]);
    expect(TranslateLanguage.ENGLISH).toBe('en');
    expect(TranslateLanguage.VIETNAMESE).toBe('vi');
    expect(TranslateLanguage.CHINESE).toBe('zh');
    expect(TranslateLanguage.HEBREW).toBe('he');
  });

  it('keeps TRANSLATE_LANGUAGES sorted by code', () => {
    expect([...TRANSLATE_LANGUAGES]).toEqual([...TRANSLATE_LANGUAGES].sort());
  });

  it('uses each error code as its own name, with a default message', () => {
    Object.entries(TranslationErrorCode).forEach(([name, code]) => {
      expect(code).toBe(name);
      expect(new TranslationError(code).message).not.toBe(code);
    });
  });

  it('lists the model statuses', () => {
    expect(Object.values(ModelStatus)).toEqual(['unknown', 'not-downloaded', 'downloading', 'downloaded', 'failed']);
    expect(library.getModelState(TranslateLanguage.ENGLISH).status).toBe(ModelStatus.DOWNLOADED);
    expect(library.getModelState(TranslateLanguage.VIETNAMESE).status).toBe(ModelStatus.UNKNOWN);
  });

  it('cannot be changed at runtime', () => {
    [TranslateLanguage, TranslationErrorCode, ModelStatus, TRANSLATE_LANGUAGES].forEach((constant) => {
      expect(Object.isFrozen(constant)).toBe(true);
    });
  });

  it('works with the API', async () => {
    await expect(
      library.translate({ text: 'Hello', from: TranslateLanguage.ENGLISH, to: TranslateLanguage.VIETNAMESE })
    ).resolves.toBe('translated:Hello');
    await expect(
      library.translate({ text: ' ', from: TranslateLanguage.ENGLISH, to: TranslateLanguage.VIETNAMESE })
    ).rejects.toMatchObject({
      code: TranslationErrorCode.INVALID_INPUT
    });
  });
});
