# Queue and memory

## One translator, one queue

You can download and translate between any number of languages. To keep memory low, only one language pair is loaded in memory at a time; translating another pair switches to it automatically.

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
translate({ text, from: TranslateLanguage.ENGLISH, to: TranslateLanguage.VIETNAMESE, signal: controller.signal }).then(
  show,
  handleError
);
// later
controller.abort();
```

| Request state when aborted | Result |
| --- | --- |
| Waiting | Removed from the queue, rejects `ABORTED`. |
| Running | Rejects `ABORTED` right away; the native translation finishes and its result is dropped. The next request starts only after that, so two translations never overlap. |
| Finished | No effect. |

There is no built-in timeout: a request runs until ML Kit answers. To give up after a delay, abort from a timer. The caller gets `ABORTED` on time, while the queue still waits for the native translation to finish before starting the next one:

```ts
async function translateWithin(text: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await translate({
      text,
      from: TranslateLanguage.ENGLISH,
      to: TranslateLanguage.VIETNAMESE,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
```

## Long text

The package sets no length limit and passes the text to ML Kit in one call. A long text holds the queue until ML Kit answers, so other callers wait, and aborting it only drops the result. Split long documents into paragraphs or sentences and translate them one by one: other callers get their turn between the parts, and an abort stops the remaining parts.

In the example self-test, a 7,241-character English text translated to Vietnamese in about 1.6 s on an iOS 18.6 simulator (Apple silicon Mac); expect longer on phones.

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
