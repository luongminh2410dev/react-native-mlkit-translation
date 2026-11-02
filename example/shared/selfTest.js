import {
  deleteModel,
  downloadModel,
  downloadModels,
  getDownloadedModels,
  getModelState,
  isModelDownloaded,
  ModelStatus,
  prepareTranslator,
  releaseTranslator,
  subscribeModelState,
  translate,
  TranslateLanguage,
  TranslationErrorCode
} from 'react-native-mlkit-translation';

const { ENGLISH, FRENCH, JAPANESE, KOREAN, VIETNAMESE } = TranslateLanguage;

// Fixed sample sentences, not user text. Shown on screen for a quality glance; logs carry metadata only.
const SAMPLES = {
  [ENGLISH]: 'Be careful, the floor is slippery.',
  [VIETNAMESE]: 'Cẩn thận, sàn nhà đang trơn trượt.',
  [JAPANESE]: '床が滑りやすいので気をつけてください。'
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves once `language` has `status`, or rejects after `timeoutMs`. */
function waitForStatus(language, status, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (getModelState(language).status === status) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`${language} never became ${status}`));
    }, timeoutMs);
    const unsubscribe = subscribeModelState((changed) => {
      if (changed === language && getModelState(language).status === status) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
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
      onStep({
        name,
        ok: false,
        ms: Date.now() - startedAt,
        detail: error.code ? `${error.code}: ${error.message}` : String(error.message || error)
      });
    }
  };

  await step('models on device', async () => ({ detail: (await getDownloadedModels()).join(', ') }));

  await step('downloadModels [vi, ja, en, vi]', async () => {
    await downloadModels([VIETNAMESE, JAPANESE, ENGLISH, VIETNAMESE]);
    const states = [VIETNAMESE, JAPANESE].map((language) => `${language}=${getModelState(language).status}`);
    if (states.some((state) => !state.endsWith(`=${ModelStatus.DOWNLOADED}`))) {
      throw new Error(states.join(' '));
    }
    return { detail: states.join(' ') };
  });

  await step('prepareTranslator en→vi', async () => {
    await prepareTranslator({ from: ENGLISH, to: VIETNAMESE });
  });

  await step('translate en→vi (prepared)', async () => ({
    sample: translated(await translate({ text: SAMPLES[ENGLISH], from: ENGLISH, to: VIETNAMESE }), SAMPLES[ENGLISH])
  }));

  await step('translate vi→en (switch pair)', async () => ({
    sample: translated(
      await translate({ text: SAMPLES[VIETNAMESE], from: VIETNAMESE, to: ENGLISH }),
      SAMPLES[VIETNAMESE]
    )
  }));

  await step('translate ja→vi (two downloaded models)', async () => ({
    sample: translated(await translate({ text: SAMPLES[JAPANESE], from: JAPANESE, to: VIETNAMESE }), SAMPLES[JAPANESE])
  }));

  await step('10 concurrent callers, alternating pairs', async () => {
    const requests = Array.from({ length: 10 }, (_, index) =>
      index % 2 === 0
        ? { text: `Sentence number ${index + 1}.`, from: ENGLISH, to: VIETNAMESE }
        : { text: `Câu số ${index + 1}.`, from: VIETNAMESE, to: ENGLISH }
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
    const running = translate({ text: SAMPLES[ENGLISH], from: ENGLISH, to: VIETNAMESE });
    const waiting = translate({ text: SAMPLES[VIETNAMESE], from: VIETNAMESE, to: ENGLISH, signal: controller.signal });
    controller.abort();
    await expectCode(waiting, TranslationErrorCode.ABORTED);
    translated(await running, SAMPLES[ENGLISH]);
    return { detail: 'ABORTED, running request still resolved' };
  });

  await step('QUEUE_FULL beyond 32 waiting', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 34 }, (_, index) => translate({ text: `Item ${index}.`, from: ENGLISH, to: VIETNAMESE }))
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    if (
      rejected.length !== 1 ||
      rejected[0].reason.code !== TranslationErrorCode.QUEUE_FULL ||
      results[33].status !== 'rejected'
    ) {
      throw new Error(`rejected: ${rejected.map((result) => result.reason.code).join(', ') || 'none'}`);
    }
    return { detail: '33 accepted, 34th QUEUE_FULL' };
  });

  await step('invalid input and language', async () => {
    await expectCode(translate({ text: '   ', from: ENGLISH, to: VIETNAMESE }), TranslationErrorCode.INVALID_INPUT);
    await expectCode(translate({ text: 'Hi', from: ENGLISH, to: 'vi-VN' }), TranslationErrorCode.UNSUPPORTED_LANGUAGE);
    return { detail: 'INVALID_INPUT, UNSUPPORTED_LANGUAGE' };
  });

  await step('deleteModel ja → MODEL_NOT_DOWNLOADED', async () => {
    await deleteModel(JAPANESE);
    await expectCode(
      translate({ text: SAMPLES[JAPANESE], from: JAPANESE, to: ENGLISH }),
      TranslationErrorCode.MODEL_NOT_DOWNLOADED
    );
    const status = getModelState(JAPANESE).status;
    if (status !== ModelStatus.NOT_DOWNLOADED) {
      throw new Error(`ja state ${status}`);
    }
    return { detail: `ja=${status}` };
  });

  await step('releaseTranslator, then translate again', async () => {
    await releaseTranslator();
    return {
      sample: translated(await translate({ text: SAMPLES[ENGLISH], from: ENGLISH, to: VIETNAMESE }), SAMPLES[ENGLISH])
    };
  });

  await step('deleteModel cancels a download in flight', async () => {
    await deleteModel(FRENCH);
    const download = downloadModel(FRENCH);
    await waitForStatus(FRENCH, ModelStatus.DOWNLOADING);
    await deleteModel(FRENCH);
    await expectCode(download, TranslationErrorCode.ABORTED);
    const status = getModelState(FRENCH).status;
    if (status !== ModelStatus.NOT_DOWNLOADED) {
      throw new Error(`fr state ${status}`);
    }
    return { detail: `ABORTED, fr=${status}` };
  });

  await step('cancelled download leaves no model', async () => {
    // ML Kit may still finish the cancelled download; the library then deletes it again.
    await wait(15000);
    if (await isModelDownloaded(FRENCH)) {
      throw new Error('fr is on the device');
    }
    return { detail: 'fr not on device after 15 s' };
  });

  await step('download again after cancelling, kept', async () => {
    await downloadModel(FRENCH);
    await wait(3000);
    if (!(await isModelDownloaded(FRENCH))) {
      throw new Error('fr was removed after it was requested again');
    }
    await deleteModel(FRENCH);
    return { detail: 'fr kept 3 s, then deleted' };
  });

  await step('signal stops one download caller only', async () => {
    const controller = new AbortController();
    const aborted = downloadModel(KOREAN, { signal: controller.signal });
    const other = downloadModel(KOREAN);
    controller.abort();
    await expectCode(aborted, TranslationErrorCode.ABORTED);
    await other;
    const status = getModelState(KOREAN).status;
    await deleteModel(KOREAN);
    if (status !== ModelStatus.DOWNLOADED) {
      throw new Error(`ko state ${status}`);
    }
    return { detail: 'ABORTED for one, downloaded for the other' };
  });

  await step('long text en→vi', async () => {
    const sentences = Array.from({ length: 150 }, (_, index) => `Sentence ${index + 1}: ${SAMPLES[ENGLISH]}`);
    const text = sentences.join(' ');
    const result = translated(await translate({ text, from: ENGLISH, to: VIETNAMESE }), text);
    return { detail: `${text.length} chars in, ${result.length} chars out` };
  });

  await step('models on device after', async () => ({ detail: (await getDownloadedModels()).join(', ') }));
}
