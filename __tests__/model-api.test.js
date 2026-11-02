import {
  createNativeModule,
  deferred,
  flushPromises,
  loadLibraryWithMockedReactNative,
  nativeError,
  renderHook
} from './helpers/load-library-with-mocked-react-native';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('downloadModel', () => {
  it('shares one native download between concurrent calls for the same language', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({ downloadModel: jest.fn(() => download.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const first = library.downloadModel('vi', { wifiOnly: true });
    const second = library.downloadModel('vi');
    expect(library.getModelState('vi')).toEqual({ status: 'downloading', error: null });

    download.resolve();
    await Promise.all([first, second]);
    expect(nativeModule.downloadModel).toHaveBeenCalledTimes(1);
    expect(nativeModule.downloadModel).toHaveBeenCalledWith('vi', true);
    expect(library.getModelState('vi')).toEqual({ status: 'downloaded', error: null });
  });

  it('downloads different languages independently', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await Promise.all([library.downloadModel('vi'), library.downloadModel('ja')]);
    expect(nativeModule.downloadModel).toHaveBeenCalledWith('vi', false);
    expect(nativeModule.downloadModel).toHaveBeenCalledWith('ja', false);
  });

  it('resolves for English without native work', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.downloadModel('en')).resolves.toBeUndefined();
    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
    expect(library.getModelState('en').status).toBe('downloaded');
  });

  it('records a failure and starts a new attempt on the next call', async () => {
    const failure = nativeError('E_NETWORK', 'No connection');
    const nativeModule = createNativeModule({
      downloadModel: jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.downloadModel('vi')).rejects.toMatchObject({ code: 'MODEL_DOWNLOAD_FAILED', cause: failure });
    const failed = library.getModelState('vi');
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatchObject({ code: 'MODEL_DOWNLOAD_FAILED' });

    await library.downloadModel('vi');
    expect(nativeModule.downloadModel).toHaveBeenCalledTimes(2);
    expect(library.getModelState('vi')).toEqual({ status: 'downloaded', error: null });
  });

  it('rejects UNSUPPORTED_LANGUAGE for an unknown code', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.downloadModel('klingon')).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
  });

  it('does not block translations of other models', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({ downloadModel: jest.fn(() => download.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    library.downloadModel('vi', { wifiOnly: true });
    await expect(library.translate({ text: 'Bonjour', from: 'fr', to: 'en' })).resolves.toBe('translated:Bonjour');
    download.resolve();
  });
});

describe('downloadModels', () => {
  it('downloads every language of the list once, skipping English and duplicates', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await library.downloadModels(['vi', 'ja', 'en', 'vi', 'fr'], { wifiOnly: true });

    expect(nativeModule.downloadModel.mock.calls).toEqual([
      ['vi', true],
      ['ja', true],
      ['fr', true]
    ]);
    ['vi', 'ja', 'fr'].forEach((language) => expect(library.getModelState(language).status).toBe('downloaded'));
  });

  it('shares downloads already in flight', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({
      downloadModel: jest.fn((language) => (language === 'vi' ? download.promise : Promise.resolve()))
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const single = library.downloadModel('vi');
    const many = library.downloadModels(['vi', 'ja']);
    download.resolve();
    await Promise.all([single, many]);

    expect(nativeModule.downloadModel).toHaveBeenCalledTimes(2);
  });

  it('waits for every download, then rejects with the first failure and records it per language', async () => {
    const slow = deferred();
    const nativeModule = createNativeModule({
      downloadModel: jest.fn((language) => {
        if (language === 'ja') {
          return Promise.reject(nativeError('E_NETWORK'));
        }
        return language === 'fr' ? slow.promise : Promise.resolve();
      })
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    let settled = false;
    const result = library.downloadModels(['vi', 'ja', 'fr']).finally(() => {
      settled = true;
    });
    await flushPromises();
    expect(settled).toBe(false);

    slow.resolve();
    await expect(result).rejects.toMatchObject({ code: 'MODEL_DOWNLOAD_FAILED' });
    expect(library.getModelState('vi').status).toBe('downloaded');
    expect(library.getModelState('ja').status).toBe('failed');
    expect(library.getModelState('fr').status).toBe('downloaded');
  });

  it('validates every code before downloading anything', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.downloadModels(['vi', 'xx'])).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    await expect(library.downloadModels('vi')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
  });

  it('resolves for an empty list', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.downloadModels([])).resolves.toBeUndefined();
    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
  });
});

describe('isModelDownloaded and getDownloadedModels', () => {
  it('updates the model state from the device', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(async () => false) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    expect(library.getModelState('vi')).toEqual({ status: 'unknown', error: null });
    await expect(library.isModelDownloaded('vi')).resolves.toBe(false);
    expect(library.getModelState('vi')).toEqual({ status: 'not-downloaded', error: null });
  });

  it('shares one native check between concurrent calls for the same language', async () => {
    const check = deferred();
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(() => check.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const first = library.isModelDownloaded('vi');
    const second = library.isModelDownloaded('vi');
    check.resolve(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(1);
    await library.isModelDownloaded('vi');
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(2);
  });

  it('answers true for English without native work', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.isModelDownloaded('en')).resolves.toBe(true);
    expect(nativeModule.isModelDownloaded).not.toHaveBeenCalled();
  });

  it('maps a failed check to MODEL_MANAGER_FAILED and keeps the state', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn().mockRejectedValue(new Error('io')) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.isModelDownloaded('vi')).rejects.toMatchObject({ code: 'MODEL_MANAGER_FAILED' });
    expect(library.getModelState('vi').status).toBe('unknown');
  });

  it('keeps a download in flight as downloading when the device says the model is missing', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({
      downloadModel: jest.fn(() => download.promise),
      isModelDownloaded: jest.fn(async () => false)
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    library.downloadModel('vi');
    await library.isModelDownloaded('vi');
    expect(library.getModelState('vi').status).toBe('downloading');
    download.resolve();
  });

  it('lists downloaded models with English, drops unknown codes, and updates every state', async () => {
    const nativeModule = createNativeModule({ getDownloadedModels: jest.fn(async () => ['vi', 'zz', 'ja']) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.getDownloadedModels()).resolves.toEqual(['en', 'ja', 'vi']);
    expect(library.getModelState('vi').status).toBe('downloaded');
    expect(library.getModelState('fr').status).toBe('not-downloaded');
  });
});

describe('deleteModel', () => {
  it('releases the translator after queued translations, then deletes the model', async () => {
    const order = [];
    const first = deferred();
    const nativeModule = createNativeModule({
      translate: jest.fn(async () => {
        order.push('translate');
        await first.promise;
        return 'done';
      }),
      releaseTranslator: jest.fn(async () => order.push('release')),
      deleteModel: jest.fn(async () => order.push('delete'))
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    await library.downloadModel('vi');

    const translation = library.translate({ text: 'Hello', from: 'en', to: 'vi' });
    const deletion = library.deleteModel('vi');
    await flushPromises();
    first.resolve();
    await Promise.all([translation, deletion]);

    expect(order).toEqual(['translate', 'release', 'delete']);
    expect(nativeModule.deleteModel).toHaveBeenCalledWith('vi');
    expect(library.getModelState('vi').status).toBe('not-downloaded');
  });

  it('waits for a download in flight for the same language', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({ downloadModel: jest.fn(() => download.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    library.downloadModel('vi');
    const deletion = library.deleteModel('vi');
    await flushPromises();
    expect(nativeModule.deleteModel).not.toHaveBeenCalled();

    download.resolve();
    await deletion;
    expect(nativeModule.deleteModel).toHaveBeenCalledTimes(1);
    expect(library.getModelState('vi').status).toBe('not-downloaded');
  });

  it('is a no-op for English', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await library.deleteModel('en');
    expect(nativeModule.deleteModel).not.toHaveBeenCalled();
    expect(nativeModule.releaseTranslator).not.toHaveBeenCalled();
  });

  it('maps a failed delete to MODEL_MANAGER_FAILED', async () => {
    const nativeModule = createNativeModule({ deleteModel: jest.fn().mockRejectedValue(new Error('busy')) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await expect(library.deleteModel('vi')).rejects.toMatchObject({ code: 'MODEL_MANAGER_FAILED' });
  });
});

describe('model state', () => {
  it('returns the same frozen object until the state changes', async () => {
    const { library } = loadLibraryWithMockedReactNative({ nativeModule: createNativeModule() });

    const before = library.getModelState('vi');
    expect(library.getModelState('vi')).toBe(before);
    expect(Object.isFrozen(before)).toBe(true);

    await library.downloadModel('vi');
    expect(library.getModelState('vi')).not.toBe(before);
  });

  it('throws UNSUPPORTED_LANGUAGE for an unknown code', () => {
    const { library } = loadLibraryWithMockedReactNative({ nativeModule: createNativeModule() });

    expect(() => library.getModelState('xx')).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_LANGUAGE' }));
  });

  it('notifies listeners with the language until they unsubscribe', async () => {
    const { library } = loadLibraryWithMockedReactNative({ nativeModule: createNativeModule() });
    const listener = jest.fn();

    const unsubscribe = library.subscribeModelState(listener);
    await library.downloadModel('vi');
    expect(listener.mock.calls).toEqual([['vi'], ['vi']]);

    unsubscribe();
    await library.downloadModel('ja');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('useModelState', () => {
  it('checks the device once while unknown and re-renders on changes for its language only', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(async () => false) });
    const loaded = loadLibraryWithMockedReactNative({ nativeModule });
    const { result, renderer } = renderHook(loaded, () => loaded.library.useModelState('vi'));

    expect(result.current.status).toBe('unknown');
    await loaded.TestRenderer.act(flushPromises);
    expect(result.current).toEqual({ status: 'not-downloaded', error: null });
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(1);

    const renders = result.renderCount;
    await loaded.TestRenderer.act(() => loaded.library.downloadModel('ja'));
    expect(result.renderCount).toBe(renders);

    await loaded.TestRenderer.act(() => loaded.library.downloadModel('vi'));
    expect(result.current).toEqual({ status: 'downloaded', error: null });

    loaded.TestRenderer.act(() => renderer.unmount());
  });

  it('checks the device once for several components showing the same language', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(async () => true) });
    const loaded = loadLibraryWithMockedReactNative({ nativeModule });
    const { React, TestRenderer, library } = loaded;
    const seen = [];

    function Probe() {
      seen.push(library.useModelState('vi').status);
      return null;
    }
    TestRenderer.act(() => {
      TestRenderer.create(
        React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(Probe))
      );
    });
    await TestRenderer.act(flushPromises);

    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(1);
    expect(seen.slice(-2)).toEqual(['downloaded', 'downloaded']);
  });

  it('stays unknown when the check fails', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn().mockRejectedValue(new Error('io')) });
    const loaded = loadLibraryWithMockedReactNative({ nativeModule });
    const { result } = renderHook(loaded, () => loaded.library.useModelState('vi'));

    await loaded.TestRenderer.act(flushPromises);
    expect(result.current.status).toBe('unknown');
  });
});
