# Queue and memory

## One translator, one queue

```text
Screen A ─┐
Screen B ─┼─> translate() ─> FIFO queue ─> one native translator
Hook C   ─┘                <─ each caller gets its own result or error
```

- Requests run one at a time, in the order `translate()` accepted them. Each caller's Promise settles once, with its own result.
- A rejected request does not affect the others.
- Up to 32 requests wait behind the running one; the next one rejects `QUEUE_FULL`.
- Requests rejected by validation (`INVALID_INPUT`, `UNSUPPORTED_LANGUAGE`) or with an already aborted signal never enter the queue.
- Native code keeps at most one translator in memory, whatever the number of downloaded models. The same language pair reuses it; another pair closes it and creates a new one from the downloaded models (no download). Alternating pairs therefore reloads models each time; group requests by pair when that matters.
- `prepareTranslator({ from, to })` loads a pair before the user needs it, for example when a screen that translates opens. It waits its turn in the queue like a translation.

## Abort

Pass an `AbortSignal` to drop requests that are no longer needed, for example when a screen unmounts or the user edits the text:

```ts
const controller = new AbortController();
translate({ text, from: 'en', to: 'vi', signal: controller.signal }).then(show, handleError);
// later
controller.abort();
```

| Request state when aborted | Result |
| --- | --- |
| Waiting | Removed from the queue, rejects `ABORTED`. |
| Running | Rejects `ABORTED` right away; the native translation finishes and its result is dropped. The next request starts only after that, so two translations never overlap. |
| Finished | No effect. |

There is no timeout: a request runs until ML Kit answers.

## Memory

Google lists a loaded translator at roughly 30–150 MB of memory on iOS. The translator stays loaded between requests so the next translation is fast.

`releaseTranslator()` frees it after every translation requested before the call; later requests load a translator again from the models on disk (slower first translation). Releasing does not delete models.

A good default is to release when the app goes to the background:

```ts
import { AppState } from 'react-native';
import { releaseTranslator } from 'react-native-mlkit-translation';

AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    releaseTranslator().catch(() => {});
  }
});
```

Do not release from a single screen's cleanup when other screens may still translate; the queue and translator are shared by the whole app.

On a JS reload or app teardown, native code releases the translator after any running translation and stops settling the old instance's promises.
