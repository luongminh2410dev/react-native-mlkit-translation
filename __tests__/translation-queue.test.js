import { createTranslationQueue } from '../src/translation-queue';
import { TranslationError } from '../src/translation-error';
import { deferred, flushPromises } from './helpers/load-library-with-mocked-react-native';

function createSignal() {
  const controller = new AbortController();
  const add = jest.spyOn(controller.signal, 'addEventListener');
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  return { controller, signal: controller.signal, add, remove };
}

describe('createTranslationQueue', () => {
  it('starts the next task only after the running one settles, and resolves each caller with its own result', async () => {
    const queue = createTranslationQueue({ maxPending: 32 });
    const first = deferred();
    const runFirst = jest.fn(() => first.promise);
    const runSecond = jest.fn(async () => 'second');

    const firstResult = queue.enqueue(runFirst);
    const secondResult = queue.enqueue(runSecond);
    await flushPromises();

    expect(runFirst).toHaveBeenCalledTimes(1);
    expect(runSecond).not.toHaveBeenCalled();

    first.resolve('first');
    await expect(firstResult).resolves.toBe('first');
    await expect(secondResult).resolves.toBe('second');
    expect(runSecond).toHaveBeenCalledTimes(1);
  });

  it('keeps going after a task rejects or throws synchronously', async () => {
    const queue = createTranslationQueue({ maxPending: 32 });
    const failure = new Error('native failure');

    const rejected = queue.enqueue(async () => {
      throw failure;
    });
    const thrown = queue.enqueue(() => {
      throw failure;
    });
    const next = queue.enqueue(async () => 'next');

    await expect(rejected).rejects.toBe(failure);
    await expect(thrown).rejects.toBe(failure);
    await expect(next).resolves.toBe('next');
  });

  it('rejects with QUEUE_FULL beyond maxPending waiting tasks, not counting the running one', async () => {
    const queue = createTranslationQueue({ maxPending: 2 });
    const running = deferred();

    const results = [
      queue.enqueue(() => running.promise),
      queue.enqueue(async () => 'a'),
      queue.enqueue(async () => 'b')
    ];
    const overflow = queue.enqueue(async () => 'c');

    await expect(overflow).rejects.toMatchObject({ code: 'QUEUE_FULL' });
    await expect(overflow).rejects.toBeInstanceOf(TranslationError);

    running.resolve('running');
    await expect(Promise.all(results)).resolves.toEqual(['running', 'a', 'b']);
    await expect(queue.enqueue(async () => 'after')).resolves.toBe('after');
  });

  it('removes an aborted waiting task without running it and frees its place', async () => {
    const queue = createTranslationQueue({ maxPending: 1 });
    const running = deferred();
    const { controller, signal, add, remove } = createSignal();
    const skipped = jest.fn(async () => 'skipped');

    queue.enqueue(() => running.promise);
    const aborted = queue.enqueue(skipped, { signal });
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);

    const accepted = queue.enqueue(async () => 'accepted');
    running.resolve('done');
    await expect(accepted).resolves.toBe('accepted');
    expect(skipped).not.toHaveBeenCalled();
  });

  it('rejects an aborted running task right away but starts the next one only after the native call settles', async () => {
    const queue = createTranslationQueue({ maxPending: 32 });
    const running = deferred();
    const { controller, signal } = createSignal();
    const next = jest.fn(async () => 'next');

    const aborted = queue.enqueue(() => running.promise, { signal });
    const nextResult = queue.enqueue(next);
    await flushPromises();
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' });
    await flushPromises();
    expect(next).not.toHaveBeenCalled();

    running.resolve('late result');
    await expect(nextResult).resolves.toBe('next');
  });

  it('rejects at once when the signal is already aborted', async () => {
    const queue = createTranslationQueue({ maxPending: 32 });
    const run = jest.fn();
    const controller = new AbortController();
    controller.abort();

    await expect(queue.enqueue(run, { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(run).not.toHaveBeenCalled();
  });

  it('settles each Promise once and removes the abort listener after success', async () => {
    const queue = createTranslationQueue({ maxPending: 32 });
    const { controller, signal, add, remove } = createSignal();

    const result = queue.enqueue(async () => 'value', { signal });
    await expect(result).resolves.toBe('value');
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);

    controller.abort();
    await expect(result).resolves.toBe('value');
  });

  it('runs a barrier after the tasks accepted before it and before the tasks accepted after it', async () => {
    const queue = createTranslationQueue({ maxPending: 32 });
    const order = [];
    const first = deferred();

    const a = queue.enqueue(async () => {
      order.push('A start');
      await first.promise;
      order.push('A end');
    });
    const release = queue.enqueueBarrier(async () => {
      order.push('release');
    });
    const b = queue.enqueue(async () => {
      order.push('B');
    });

    await flushPromises();
    expect(order).toEqual(['A start']);
    first.resolve();
    await Promise.all([a, release, b]);
    expect(order).toEqual(['A start', 'A end', 'release', 'B']);
  });

  it('does not count barriers against maxPending', async () => {
    const queue = createTranslationQueue({ maxPending: 1 });
    const running = deferred();

    queue.enqueue(() => running.promise);
    const barrier = queue.enqueueBarrier(async () => 'barrier');
    const waiting = queue.enqueue(async () => 'waiting');

    running.resolve();
    await expect(barrier).resolves.toBe('barrier');
    await expect(waiting).resolves.toBe('waiting');
  });
});
