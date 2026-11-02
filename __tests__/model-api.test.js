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
    await flushPromises();
    const third = library.downloadModel('vi');
    expect(library.getModelState('vi')).toEqual({ status: 'downloading', error: null });

    download.resolve();
    await Promise.all([first, second, third]);
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(1);
    expect(nativeModule.downloadModel).toHaveBeenCalledTimes(1);
    expect(nativeModule.downloadModel).toHaveBeenCalledWith('vi', true);
    expect(library.getModelState('vi')).toEqual({ status: 'downloaded', error: null });
  });

  it('resolves without downloading when the model is already on the device', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(async () => true) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    const statuses = [];
    library.subscribeModelState((language) => statuses.push(library.getModelState(language).status));

    await library.downloadModel('vi');
    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
    expect(statuses).toEqual(['downloaded']);
  });

  it('shares the check with calls made before it answers', async () => {
    const check = deferred();
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(() => check.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const first = library.downloadModel('vi');
    const second = library.downloadModel('vi');
    expect(library.getModelState('vi').status).toBe('unknown');

    check.resolve(false);
    await Promise.all([first, second]);
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(1);
    expect(nativeModule.downloadModel).toHaveBeenCalledTimes(1);
  });

  it('downloads when the check fails', async () => {
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn().mockRejectedValue(new Error('io')) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    await library.downloadModel('vi');
    expect(nativeModule.downloadModel).toHaveBeenCalledWith('vi', false);
    expect(library.getModelState('vi').status).toBe('downloaded');
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

describe('download signal', () => {
  it('stops only the aborted caller; the shared download goes on', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({ downloadModel: jest.fn(() => download.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    const controller = new AbortController();

    const aborted = library.downloadModel('vi', { signal: controller.signal });
    const other = library.downloadModel('vi');
    await flushPromises();
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' });
    expect(library.getModelState('vi').status).toBe('downloading');
    download.resolve();
    await expect(other).resolves.toBeUndefined();
    expect(library.getModelState('vi').status).toBe('downloaded');
  });

  it('rejects ABORTED without downloading when the signal is already aborted', async () => {
    const nativeModule = createNativeModule();
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    const controller = new AbortController();
    controller.abort();

    await expect(library.downloadModel('vi', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    await expect(library.downloadModels(['vi'], { signal: controller.signal })).rejects.toMatchObject({
      code: 'ABORTED'
    });
    await expect(library.downloadModel('xx', { signal: controller.signal })).rejects.toMatchObject({
      code: 'UNSUPPORTED_LANGUAGE'
    });
    expect(nativeModule.isModelDownloaded).not.toHaveBeenCalled();
    expect(nativeModule.downloadModel).not.toHaveBeenCalled();
  });

  it('stops waiting for several downloads and removes its abort listener once settled', async () => {
    const download = deferred();
    const nativeModule = createNativeModule({ downloadModel: jest.fn(() => download.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });
    const signal = { aborted: false, listeners: new Set() };
    signal.addEventListener = (type, listener) => signal.listeners.add(listener);
    signal.removeEventListener = (type, listener) => signal.listeners.delete(listener);

    const all = library.downloadModels(['vi', 'ja'], { signal });
    expect(signal.listeners.size).toBe(1);
    signal.listeners.forEach((listener) => listener());
    await expect(all).rejects.toMatchObject({ code: 'ABORTED' });
    expect(signal.listeners.size).toBe(0);

    const done = library.downloadModel('fr', { signal });
    download.resolve();
    await done;
    expect(signal.listeners.size).toBe(0);
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
    await flushPromises();
    expect(library.getModelState('vi').status).toBe('downloading');
    await library.isModelDownloaded('vi');
    expect(library.getModelState('vi').status).toBe('downloading');
    download.resolve();
  });

  it('ignores a check that answers after the model was deleted', async () => {
    const check = deferred();
    const nativeModule = createNativeModule({ isModelDownloaded: jest.fn(() => check.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const outdated = library.isModelDownloaded('vi');
    await library.deleteModel('vi');
    check.resolve(true);

    await expect(outdated).resolves.toBe(false);
    expect(library.getModelState('vi').status).toBe('not-downloaded');
  });

  it('ignores a check that answers after a download finished', async () => {
    const check = deferred();
    const nativeModule = createNativeModule({
      isModelDownloaded: jest.fn().mockImplementationOnce(() => check.promise)
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const outdated = library.isModelDownloaded('vi');
    await library.downloadModel('vi');
    check.resolve(false);

    await expect(outdated).resolves.toBe(true);
    expect(library.getModelState('vi').status).toBe('downloaded');
  });

  it('starts a new check instead of sharing one started before a delete', async () => {
    const check = deferred();
    const nativeModule = createNativeModule({
      isModelDownloaded: jest.fn().mockImplementationOnce(() => check.promise)
    });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    library.isModelDownloaded('vi');
    await library.deleteModel('vi');
    await expect(library.isModelDownloaded('vi')).resolves.toBe(false);
    expect(nativeModule.isModelDownloaded).toHaveBeenCalledTimes(2);
    check.resolve(true);
  });

  it('ignores a model list that answers after the model was deleted', async () => {
    const list = deferred();
    const nativeModule = createNativeModule({ getDownloadedModels: jest.fn(() => list.promise) });
    const { library } = loadLibraryWithMockedReactNative({ nativeModule });

    const outdated = library.getDownloadedModels();
    await library.deleteModel('vi');
    list.resolve(['vi', 'ja']);

    await expect(outdated).resolves.toEqual(['en', 'ja']);
    expect(library.getModelState('vi').status).toBe('not-downloaded');
    expect(library.getModelState('ja').status).toBe('downloaded');
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

  describe('during a download of the same language', () => {
    function setup() {
      const download = deferred();
      const nativeModule = createNativeModule({
        downloadModel: jest.fn().mockImplementationOnce(() => download.promise)
      });
      const loaded = loadLibraryWithMockedReactNative({ nativeModule });
      return { download, nativeModule, library: loaded.library };
    }

    it('cancels it: callers reject ABORTED and the model is deleted without waiting', async () => {
      const { download, nativeModule, library } = setup();
      const first = library.downloadModel('vi', { wifiOnly: true });
      const many = library.downloadModels(['vi', 'ja']);
      await flushPromises();
      expect(library.getModelState('vi').status).toBe('downloading');

      await library.deleteModel('vi');
      await expect(first).rejects.toMatchObject({ code: 'ABORTED' });
      await expect(many).rejects.toMatchObject({ code: 'ABORTED' });
      expect(nativeModule.deleteModel).toHaveBeenCalledTimes(1);
      expect(library.getModelState('vi')).toEqual({ status: 'not-downloaded', error: null });
      expect(library.getModelState('ja').status).toBe('downloaded');
      download.resolve();
    });

    it('removes the model again when the cancelled download still finishes', async () => {
      const download = deferred();
      let onDisk = false;
      const nativeModule = createNativeModule({
        isModelDownloaded: jest.fn(async () => onDisk),
        downloadModel: jest.fn(() => download.promise.then(() => (onDisk = true))),
        deleteModel: jest.fn(async () => (onDisk = false))
      });
      const { library } = loadLibraryWithMockedReactNative({ nativeModule });
      library.downloadModel('vi').catch(() => {});
      await flushPromises();
      await library.deleteModel('vi');

      const statuses = [];
      library.subscribeModelState((language) => statuses.push(library.getModelState(language).status));
      download.resolve();
      // The model is on disk again until the orphan is removed; checks meanwhile do not report it.
      await expect(library.isModelDownloaded('vi')).resolves.toBe(false);
      await flushPromises();
      expect(onDisk).toBe(false);
      await expect(library.isModelDownloaded('vi')).resolves.toBe(false);

      expect(nativeModule.deleteModel).toHaveBeenCalledTimes(2);
      expect(nativeModule.releaseTranslator).toHaveBeenCalledTimes(2);
      expect(library.getModelState('vi').status).toBe('not-downloaded');
      expect(statuses).not.toContain('downloaded');
    });

    it('keeps the model when it was requested again before the cancelled download finished', async () => {
      const { download, nativeModule, library } = setup();
      library.downloadModel('vi').catch(() => {});
      await flushPromises();
      await library.deleteModel('vi');

      const again = library.downloadModel('vi');
      await again;
      download.resolve();
      await flushPromises();

      expect(nativeModule.deleteModel).toHaveBeenCalledTimes(1);
      expect(nativeModule.downloadModel).toHaveBeenCalledTimes(2);
      expect(library.getModelState('vi').status).toBe('downloaded');
    });

    it('forgets the cancelled download when it fails', async () => {
      const { download, nativeModule, library } = setup();
      library.downloadModel('vi').catch(() => {});
      await flushPromises();
      await library.deleteModel('vi');

      download.reject(nativeError('E_NETWORK'));
      await flushPromises();
      expect(nativeModule.deleteModel).toHaveBeenCalledTimes(1);
      expect(library.getModelState('vi').status).toBe('not-downloaded');
    });

    it('starts a download requested during the deletion after it', async () => {
      const order = [];
      const nativeModule = createNativeModule({
        deleteModel: jest.fn(async () => order.push('delete')),
        downloadModel: jest.fn(async () => order.push('download'))
      });
      const { library } = loadLibraryWithMockedReactNative({ nativeModule });

      await Promise.all([library.deleteModel('vi'), library.downloadModel('vi')]);
      expect(order).toEqual(['delete', 'download']);
      expect(library.getModelState('vi').status).toBe('downloaded');
    });
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

  describe('with a listener that throws', () => {
    let reported;

    beforeEach(() => {
      reported = [];
      jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        reported.push(callback);
        return 0;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('still notifies the other listeners, settles the download, and rethrows the error later', async () => {
      const { library } = loadLibraryWithMockedReactNative({ nativeModule: createNativeModule() });
      const failure = new Error('listener failed');
      const other = jest.fn();
      library.subscribeModelState(() => {
        throw failure;
      });
      library.subscribeModelState(other);

      await expect(library.downloadModel('vi')).resolves.toBeUndefined();
      expect(other.mock.calls).toEqual([['vi'], ['vi']]);
      expect(library.getModelState('vi').status).toBe('downloaded');
      expect(reported).toHaveLength(2);
      expect(reported[0]).toThrow(failure);
    });

    it('keeps the download error', async () => {
      const nativeModule = createNativeModule({ downloadModel: jest.fn().mockRejectedValue(nativeError('E_NETWORK')) });
      const { library } = loadLibraryWithMockedReactNative({ nativeModule });
      library.subscribeModelState(() => {
        throw new Error('listener failed');
      });

      await expect(library.downloadModel('vi')).rejects.toMatchObject({ code: 'MODEL_DOWNLOAD_FAILED' });
      expect(library.getModelState('vi').status).toBe('failed');
    });
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
