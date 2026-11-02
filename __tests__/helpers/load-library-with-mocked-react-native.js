/**
 * Loads `src/index.js` against a fresh mocked `react-native` module, so every test starts with an empty queue and
 * model store. React and react-test-renderer come from the same module registry so hooks share one React copy.
 */
export function loadLibraryWithMockedReactNative({ nativeModule } = {}) {
  jest.resetModules();

  const TurboModuleRegistry = {
    get: jest.fn(() => nativeModule ?? null)
  };

  jest.doMock('react-native', () => ({ TurboModuleRegistry }), { virtual: true });

  const library = require('../../src/index');
  const React = require('react');
  const TestRenderer = require('react-test-renderer');

  return { library, React, TestRenderer, TurboModuleRegistry };
}

/** A Promise with its settle functions exposed, to control the order of native results in tests. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending Promise callbacks run. */
export async function flushPromises() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

/** Native module mock: every method resolves and no model is on the device. Override any method per test. */
export function createNativeModule(overrides = {}) {
  return {
    isModelDownloaded: jest.fn(async () => false),
    getDownloadedModels: jest.fn(async () => ['en']),
    downloadModel: jest.fn(async () => undefined),
    deleteModel: jest.fn(async () => undefined),
    prepareTranslator: jest.fn(async () => undefined),
    translate: jest.fn(async (text) => `translated:${text}`),
    releaseTranslator: jest.fn(async () => undefined),
    ...overrides
  };
}

/** Native rejection shaped like React Native's promise rejection: an Error with a `code`. */
export function nativeError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Renders `useHook` in a test component and returns the latest value plus the renderer. */
export function renderHook(loaded, useHook) {
  const { React, TestRenderer } = loaded;
  const result = { current: undefined, renderCount: 0 };

  function Probe() {
    result.current = useHook();
    result.renderCount += 1;
    return null;
  }

  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });

  return { result, renderer };
}
