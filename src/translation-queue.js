import { TranslationError, TranslationErrorCode } from './translation-error';

/**
 * Runs native work one task at a time, in the order it was accepted.
 *
 * - `enqueue(run, { signal })`: a translation. At most `maxPending` wait behind the running one; more reject
 *   `QUEUE_FULL`.
 *   Aborting a waiting task removes it. Aborting the running task rejects its caller right away, but the next task
 *   starts only after the native call settles, so two native calls never overlap.
 * - `enqueueBarrier(run)`: work that must not overlap a translation (releasing or deleting models). Runs after every
 *   task accepted before it and before every task accepted after it. Not counted against `maxPending`.
 *
 * Each returned Promise settles once.
 */
export function createTranslationQueue({ maxPending }) {
  const waiting = [];
  let waitingTaskCount = 0;
  let running = false;

  function settle(item, settleWith) {
    if (item.settled) {
      return;
    }
    item.settled = true;
    if (item.signal && item.onAbort) {
      item.signal.removeEventListener('abort', item.onAbort);
    }
    settleWith();
  }

  function abort(item) {
    if (item.settled) {
      return;
    }
    if (!item.started) {
      const index = waiting.indexOf(item);
      if (index !== -1) {
        waiting.splice(index, 1);
        waitingTaskCount -= 1;
      }
    }
    settle(item, () => item.reject(new TranslationError(TranslationErrorCode.ABORTED)));
  }

  function drain() {
    if (running || waiting.length === 0) {
      return;
    }

    const item = waiting.shift();
    if (item.countsTowardLimit) {
      waitingTaskCount -= 1;
    }
    item.started = true;
    running = true;

    let result;
    try {
      result = Promise.resolve(item.run());
    } catch (error) {
      result = Promise.reject(error);
    }

    result
      .then(
        (value) => settle(item, () => item.resolve(value)),
        (error) => settle(item, () => item.reject(error))
      )
      .then(() => {
        running = false;
        drain();
      });
  }

  function add(run, { signal, countsTowardLimit }) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new TranslationError(TranslationErrorCode.ABORTED));
        return;
      }
      if (countsTowardLimit && waitingTaskCount >= maxPending) {
        reject(new TranslationError(TranslationErrorCode.QUEUE_FULL));
        return;
      }

      const item = { run, resolve, reject, signal, countsTowardLimit, started: false, settled: false, onAbort: null };
      if (signal) {
        item.onAbort = () => abort(item);
        signal.addEventListener('abort', item.onAbort);
      }
      waiting.push(item);
      if (countsTowardLimit) {
        waitingTaskCount += 1;
      }
      drain();
    });
  }

  return {
    enqueue(run, { signal } = {}) {
      return add(run, { signal, countsTowardLimit: true });
    },
    enqueueBarrier(run) {
      return add(run, { signal: undefined, countsTowardLimit: false });
    }
  };
}
