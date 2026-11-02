---
name: docs-follow-code
description: Use when an authorized change alters behavior, public API, platform support, configuration, or setup steps described by doc comments, type declarations, README, or `docs/`.
---

# Docs Follow Code

Adapted from the jupi-app skill. This updates documentation and does not authorize version bumps or publishing.

Update existing behavior descriptions in the same task, nearest to farthest:

1. JSDoc in `src/*.js` and comments in Kotlin/Objective-C++ for the changed symbol: inputs, results, error codes, side effects.
2. `src/index.d.ts`: types for every export and returned value.
3. `docs/`: `api-reference.md` (every export: signature, results, errors), `models-and-downloads.md`, `queue-and-memory.md`, `privacy-and-attribution.md`, `compatibility-matrix.md`, `testing-with-jest.md`.
4. `README.md`: short pitch, installation (rebuild, `pod install`, iOS 15.5), quick usage, API summary table, links to `docs/`. Keep details out of the README; add them to the matching `docs/` page.
5. `package.json` `description` / `keywords` when the scope of the library changes.
6. `AGENTS.md` and the skills in `.agents/skills/` when structure, tooling, scripts, or verification commands change.

Find descriptions by symbol, error code, language code, and behavior terms with targeted `rg`. Documentation of the changed behavior is in scope even if outside the code diff. Private renames, formatting, and typos need no documentation sweep.

## Write the current state, not a work log

README, comments, and types describe how the library behaves now, in the present tense. Rewrite the affected sentence instead of appending to it. Do not add:

- Change history: "now uses…", "was replaced by…", "no longer requires…". Release notes belong in a changelog or GitHub release, only when the user asks for one.
- Task scope or process notes, or rules already in `AGENTS.md`.
- Verification records: "tested on Pixel 8", "tests pass". These go in the task report; docs state lasting limits only (e.g. "does not run in Expo Go", "requires iOS 15.5").
- APIs, files, or values that no longer exist.

Keep a reason only when it explains a current non-obvious choice (a threading choice, an SDK limit), in one clause. Prefer tables and short bullets; keep README examples runnable and matching the exported names.

## Report status in the task, not in the docs

Distinguish written, checked locally, run on a device, and published. Report updated docs or state that no documented behavior changed. Mention verification gaps.
