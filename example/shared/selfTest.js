import {
  deleteModel,
  downloadModels,
  getDownloadedModels,
  getModelState,
  prepareTranslator,
  releaseTranslator,
  translate
} from 'react-native-mlkit-translation';

// Fixed sample sentences, not user text. Shown on screen for a quality glance; logs carry metadata only.
const SAMPLES = {
  en: 'Be careful, the floor is slippery.',
  vi: 'Cẩn thận, sàn nhà đang trơn trượt.',
  ja: '床が滑りやすいので気をつけてください。'
};

async function expectCode(promise, code) {
  try {
    await promise;
  } catch (error) {
    if (error.code === code) {
      return code;
    }
    throw new Error(`expected ${code}, got ${error.code}: ${error.message}`);
  }
  throw new Error(`expected ${code}, got a result`);
}

function translated(result, input) {
  if (typeof result !== 'string' || result.trim() === '' || result === input) {
    throw new Error('empty or unchanged result');
  }
  return result;
}

/**
 * Runs every library scenario against the real native module. Needs network for the first model downloads.
 * `onStep({ name, ok, ms, detail, sample })` is called after each step.
 */
export async function runSelfTest(onStep) {
  const step = async (name, run) => {
    const startedAt = Date.now();
    try {
      const { detail, sample } = (await run()) || {};
      onStep({ name, ok: true, ms: Date.now() - startedAt, detail, sample });
    } catch (error) {
      onStep({ name, ok: false, ms: Date.now() - startedAt, detail: error.code ? `${error.code}: ${error.message}` : String(error.message || error) });
    }
  };

  await step('models on device', async () => ({ detail: (await getDownloadedModels()).join(', ') }));

  await step('downloadModels [vi, ja, en, vi]', async () => {
    await downloadModels(['vi', 'ja', 'en', 'vi']);
    const states = ['vi', 'ja'].map((language) => `${language}=${getModelState(language).status}`);
    if (states.some((state) => !state.endsWith('=downloaded'))) {
      throw new Error(states.join(' '));
    }
    return { detail: states.join(' ') };
  });

  await step('prepareTranslator en→vi', async () => {
    await prepareTranslator({ from: 'en', to: 'vi' });
  });

  await step('translate en→vi (prepared)', async () => ({
    sample: translated(await translate({ text: SAMPLES.en, from: 'en', to: 'vi' }), SAMPLES.en)
  }));

  await step('translate vi→en (switch pair)', async () => ({
    sample: translated(await translate({ text: SAMPLES.vi, from: 'vi', to: 'en' }), SAMPLES.vi)
  }));

  await step('translate ja→vi (two downloaded models)', async () => ({
    sample: translated(await translate({ text: SAMPLES.ja, from: 'ja', to: 'vi' }), SAMPLES.ja)
  }));

  await step('10 concurrent callers, alternating pairs', async () => {
    const requests = Array.from({ length: 10 }, (_, index) =>
      index % 2 === 0
        ? { text: `Sentence number ${index + 1}.`, from: 'en', to: 'vi' }
        : { text: `Câu số ${index + 1}.`, from: 'vi', to: 'en' }
    );
    const results = await Promise.all(requests.map((request) => translate(request)));
    // Each caller gets the translation of its own sentence: the number survives translation.
    results.forEach((result, index) => {
      if (!result.includes(String(index + 1))) {
        throw new Error(`result ${index + 1} does not belong to its caller`);
      }
    });
    return { detail: `${results.length} ok` };
  });

  await step('abort a waiting request', async () => {
    const controller = new AbortController();
    const running = translate({ text: SAMPLES.en, from: 'en', to: 'vi' });
    const waiting = translate({ text: SAMPLES.vi, from: 'vi', to: 'en', signal: controller.signal });
    controller.abort();
    await expectCode(waiting, 'ABORTED');
    translated(await running, SAMPLES.en);
    return { detail: 'ABORTED, running request still resolved' };
  });

  await step('QUEUE_FULL beyond 32 waiting', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 34 }, (_, index) => translate({ text: `Item ${index}.`, from: 'en', to: 'vi' }))
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    if (rejected.length !== 1 || rejected[0].reason.code !== 'QUEUE_FULL' || results[33].status !== 'rejected') {
      throw new Error(`rejected: ${rejected.map((result) => result.reason.code).join(', ') || 'none'}`);
    }
    return { detail: '33 accepted, 34th QUEUE_FULL' };
  });

  await step('invalid input and language', async () => {
    await expectCode(translate({ text: '   ', from: 'en', to: 'vi' }), 'INVALID_INPUT');
    await expectCode(translate({ text: 'Hi', from: 'en', to: 'vi-VN' }), 'UNSUPPORTED_LANGUAGE');
    return { detail: 'INVALID_INPUT, UNSUPPORTED_LANGUAGE' };
  });

  await step('deleteModel ja → MODEL_NOT_DOWNLOADED', async () => {
    await deleteModel('ja');
    await expectCode(translate({ text: SAMPLES.ja, from: 'ja', to: 'en' }), 'MODEL_NOT_DOWNLOADED');
    const status = getModelState('ja').status;
    if (status !== 'not-downloaded') {
      throw new Error(`ja state ${status}`);
    }
    return { detail: `ja=${status}` };
  });

  await step('releaseTranslator, then translate again', async () => {
    await releaseTranslator();
    return { sample: translated(await translate({ text: SAMPLES.en, from: 'en', to: 'vi' }), SAMPLES.en) };
  });

  await step('models on device after', async () => ({ detail: (await getDownloadedModels()).join(', ') }));
}
