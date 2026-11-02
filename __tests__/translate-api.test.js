import {
  createNativeModule,
  deferred,
  flushPromises,
  loadLibraryWithMockedReactNative,
  nativeError
} from './helpers/load-library-with-mocked-react-native';

describe('translate', () => {
  it('passes the text and languages to native code unchanged', async () => {
    const nativeModule = createNativeModule({ translate: jest.fn(async () => 'Xin chào.') });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.translate({ text: '  Hello. ', from: 'en', to: 'vi' })).resolves.toBe('Xin chào.');
    expect(nativeModule.translate).toHaveBeenCalledWith('  Hello. ', 'en', 'vi');
  });

  it('runs requests from several callers in order, each with its own result', async () => {
    const first = deferred();
    const translateMock = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce('Be careful.');
    const nativeModule = createNativeModule({ translate: translateMock });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const a = library.translate({ text: 'Hello.', from: 'en', to: 'vi' });
    const b = library.translate({ text: 'Cẩn thận.', from: 'vi', to: 'en' });
    await flushPromises();
    expect(translateMock).toHaveBeenCalledTimes(1);

    first.resolve('Xin chào.');
    await expect(a).resolves.toBe('Xin chào.');
    await expect(b).resolves.toBe('Be careful.');
    expect(translateMock).toHaveBeenNthCalledWith(2, 'Cẩn thận.', 'vi', 'en');
  });

  it.each([[''], ['   \n\t'], [undefined], [42]])(
    'rejects INVALID_INPUT for text %p without native work',
    async (text) => {
      const nativeModule = createNativeModule();
      const { library } = loadLibraryWithMockedReactNative({ nativeModule });

      await expect(library.translate({ text, from: 'en', to: 'vi' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(nativeModule.translate).not.toHaveBeenCalled();
    }
  );

  it('rejects INVALID_INPUT without a request object', async () => {
    const { library } = loadLibraryWithMockedReactNative({ nativeModule: createNativeModule() });

    await expect(library.translate()).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it.each([
    ['xx', 'vi'],
    ['en', 'VI'],
    ['en', 'vi-VN']
  ])('rejects UNSUPPORTED_LANGUAGE for %s → %s', async (from, to) => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const result = library.translate({ text: 'Hello', from, to });
    await expect(result).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    await expect(result).rejects.toBeInstanceOf(library.TranslationError);
    expect(nativeModule.translate).not.toHaveBeenCalled();
  });

  it('returns the text unchanged when both languages are the same', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.translate({ text: 'Xin chào', from: 'vi', to: 'vi' })).resolves.toBe('Xin chào');
    expect(nativeModule.translate).not.toHaveBeenCalled();
  });

  it('rejects NATIVE_UNAVAILABLE when the native module is not linked, without failing at import', async () => {
    const { library } = loadLibraryWithMockedReactNative({ nativeModule: undefined });

    await expect(library.translate({ text: 'Hello', from: 'en', to: 'vi' })).rejects.toMatchObject({
      code: 'NATIVE_UNAVAILABLE'
    });
    await expect(library.releaseTranslator()).rejects.toMatchObject({ code: 'NATIVE_UNAVAILABLE' });
  });

  it('keeps known native error codes and maps others to TRANSLATION_FAILED', async () => {
    const native = nativeError('TRANSLATION_FAILED', 'Translator crashed');
    const nativeModule = createNativeModule({
      translate: jest
        .fn()
        .mockRejectedValueOnce(native)
        .mockRejectedValueOnce(nativeError('E_SOMETHING'))
        .mockRejectedValueOnce('plain string')
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    const request = { text: 'Hello', from: 'en', to: 'vi' };

    await expect(library.translate(request)).rejects.toMatchObject({
      code: 'TRANSLATION_FAILED',
      message: 'Translator crashed',
      cause: native
    });
    await expect(library.translate(request)).rejects.toMatchObject({ code: 'TRANSLATION_FAILED' });
    await expect(library.translate(request)).rejects.toMatchObject({ code: 'TRANSLATION_FAILED' });
  });

  it('refreshes the model states of both languages after MODEL_NOT_DOWNLOADED', async () => {
    const nativeModule = createNativeModule({
      translate: jest.fn().mockRejectedValue(nativeError('MODEL_NOT_DOWNLOADED')),
      isModelDownloaded: jest.fn(async (language) => language !== 'vi')
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.translate({ text: 'Hello', from: 'en', to: 'vi' })).rejects.toMatchObject({
      code: 'MODEL_NOT_DOWNLOADED'
    });
    await flushPromises();

    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledWith('vi');
    expect(library.getModelState('vi').status).toBe('not-downloaded');
    expect(library.getModelState('en').status).toBe('downloaded');
  });

  it('aborts a waiting request through its signal', async () => {
    const first = deferred();
    const nativeModule = createNativeModule({ translate: jest.fn().mockImplementationOnce(() => first.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    const controller = new AbortController();

    library.translate({ text: 'One', from: 'en', to: 'vi' });
    const aborted = library.translate({ text: 'Two', from: 'en', to: 'vi', signal: controller.signal });
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' });
    first.resolve('Một');
    await flushPromises();
    expect(nativeModule.translate).toHaveBeenCalledTimes(1);
  });
});

describe('prepareTranslator', () => {
  it('loads the requested pair in queue order, between translations', async () => {
    const order = [];
    const first = deferred();
    const nativeModule = createNativeModule({
      translate: jest.fn(async (text, from, to) => {
        order.push(`translate ${from}-${to}`);
        if (text === 'A') {
          await first.promise;
        }
        return text;
      }),
      prepareTranslator: jest.fn(async (from, to) => {
        order.push(`prepare ${from}-${to}`);
      })
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const a = library.translate({ text: 'A', from: 'en', to: 'vi' });
    const prepare = library.prepareTranslator({ from: 'ja', to: 'vi' });
    const b = library.translate({ text: 'B', from: 'ja', to: 'vi' });
    await flushPromises();
    first.resolve();
    await Promise.all([a, prepare, b]);

    expect(order).toEqual(['translate en-vi', 'prepare ja-vi', 'translate ja-vi']);
  });

  it('validates languages and skips native work for the same language', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.prepareTranslator({ from: 'en', to: 'xx' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_LANGUAGE'
    });
    await expect(library.prepareTranslator()).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    await expect(library.prepareTranslator({ from: 'vi', to: 'vi' })).resolves.toBeUndefined();
    expect(nativeModule.prepareTranslator).not.toHaveBeenCalled();
  });

  it('rejects MODEL_NOT_DOWNLOADED without downloading and refreshes the model states', async () => {
    const nativeModule = createNativeModule({
      prepareTranslator: jest.fn().mockRejectedValue(nativeError('MODEL_NOT_DOWNLOADED')),
      isModelDownloaded: jest.fn(async () => false)
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.prepareTranslator({ from: 'ja', to: 'vi' })).rejects.toMatchObject({
      code: 'MODEL_NOT_DOWNLOADED'
    });
    await flushPromises();

    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
    expect(library.getModelState('ja').status).toBe('not-downloaded');
    expect(library.getModelState('vi').status).toBe('not-downloaded');
  });
});

describe('releaseTranslator', () => {
  it('runs after the translations requested before it and before the ones requested after it', async () => {
    const order = [];
    const first = deferred();
    const nativeModule = createNativeModule({
      translate: jest.fn(async (text) => {
        order.push(`translate ${text}`);
        if (text === 'A') {
          await first.promise;
        }
        return text;
      }),
      releaseTranslator: jest.fn(async () => {
        order.push('release');
      })
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const a = library.translate({ text: 'A', from: 'en', to: 'vi' });
    const release = library.releaseTranslator();
    const b = library.translate({ text: 'B', from: 'en', to: 'vi' });
    await flushPromises();
    first.resolve();
    await Promise.all([a, release, b]);

    expect(order).toEqual(['translate A', 'release', 'translate B']);
    expect(nativeModule.deleteModel).not.toHaveBeenCalled();
  });
});
