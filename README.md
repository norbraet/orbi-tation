# DOM Mutation Tracker

A framework-agnostic debugging utility that records DOM mutations as typed,
serializable events through an explicit, side-effect-free package API.

![Zero Runtime Dependencies](https://img.shields.io/badge/Runtime%20Dependencies-0-blue)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)

## Features

- Attribute, child-list, and character-data observation
- Serializable events without native DOM nodes or `MutationRecord` objects
- Strict TypeScript types and declaration maps
- Side-effect-free ESM and CommonJS package entries
- Console presentation and visual highlighting
- Bounded history, deduplication, subscriptions, and explicit lifecycle control
- Zero runtime dependencies

## Install

```bash
npm install --save-dev dom-mutation-tracker
```

Importing the package does not start an observer or change the page.

```ts
import { createTracker } from "dom-mutation-tracker";

const tracker = createTracker();
const unsubscribe = tracker.subscribe((event) => {
  console.log(event);
});

tracker.start();

// Later:
unsubscribe();
tracker.stop();
```

## Development-only integration

Installing the package as a `devDependency` does not by itself keep it out of a
production browser bundle. Guard a lazy import with a compile-time development
constant so the production build can remove the import and tracker code:

```ts
if (import.meta.env.DEV) {
  void Promise.all([
    import("dom-mutation-tracker"),
    import("dom-mutation-tracker/panel"),
  ]).then(([{ createTracker }, { createPanel }]) => {
    const tracker = createTracker();
    const panel = createPanel(tracker);

    panel.mount();
    tracker.start();
  });
}
```

`import.meta.env.DEV` is the Vite-style spelling. Other bundlers should replace
an equivalent compile-time constant with `false` in production. Keep the guard
directly around the dynamic import so dead-code elimination can remove the
entire chunk; a runtime-only setting cannot provide that guarantee.

The package does not inspect the host application's environment. If production
code explicitly imports and starts a tracker, it will run. This explicit-opt-in
behavior keeps the core bundler-neutral and avoids unreliable environment
detection; production exclusion therefore remains the host build's
responsibility. Every public entry is side-effect-free, no entry auto-starts,
and no browser global is exposed as an alternate initialization path.

## Console and highlight presentation

The optional panel entry owns presentation behavior so the core remains free of
UI side effects.

```ts
import { createTracker } from "dom-mutation-tracker";
import { createPanel } from "dom-mutation-tracker/panel";

const tracker = createTracker();
const panel = createPanel(tracker, {
  highlightColor: "#ff0000",
  highlightDuration: 3000,
});

panel.mount();
tracker.start();

// Cleanup:
tracker.stop();
panel.unmount();
```

## Core API

### `createTracker(options?)`

Options:

| Option           | Default         | Description                                      |
| ---------------- | --------------- | ------------------------------------------------ |
| `root`           | `document.body` | DOM node observed after `start()`                |
| `maxEvents`      | `100`           | Positive integer event-history limit             |
| `dedupeWindowMs` | `50`            | Non-negative duplicate suppression window        |
| `onError`        | `console.error` | Receives normalized record and listener failures |

The returned tracker provides:

- `start()` — begin observing; repeated calls are safe.
- `stop()` — disconnect the observer; repeated calls are safe.
- `clear()` — clear history and deduplication state without stopping.
- `getEvents()` — return a readonly snapshot of normalized events.
- `subscribe(listener)` — receive events and return an idempotent unsubscribe
  function.

Invalid configuration fails synchronously. Starting without an available root
or `MutationObserver` throws a `TrackerError` with a stable error code.

## Event model

`TrackerMutationEvent` is a discriminated union of:

- `TrackerAttributeEvent`
- `TrackerChildListEvent`
- `TrackerCharacterDataEvent`

Every event has a monotonic `sequence`, ISO timestamp, type, and serializable
target description. Child nodes are represented by compact summaries. Events
do not expose live DOM nodes or native mutation records.

```ts
tracker.subscribe((event) => {
  if (event.type === "attributes") {
    console.log(event.attributeName, event.oldValue, event.newValue);
  }
});
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete public
contract and module boundaries.

## Package outputs

`npm run build` creates:

- `dist/index.js` and `dist/index.cjs` — side-effect-free core entry
- `dist/panel.js` and `dist/panel.cjs` — optional presentation entry
- `.d.ts`, `.d.cts`, declaration maps, and JavaScript source maps
- `src/` — TypeScript sources referenced by declaration maps

Package contents and both ESM and CommonJS imports are verified from the packed
tarball by `npm run test:package`.

## Development

```bash
npm run format
npm run format:check
npm run typecheck
npm test
npm run test:browser:install
npm run test:browser
npm run test:package
npm run test:production
```

`npm run verify` runs strict type-checking, unit tests, builds, package packing,
ESM/CommonJS smoke imports, the focused Chromium integration suite, and a
production tree-shaking fixture that verifies guarded imports are removed.

## Limitations

- Observation defaults to `document.body`; pass `root` for another DOM node.
- Closed Shadow DOM and iframe contents are not observed automatically.
- Selectors describe the target at mutation-processing time and may become
  stale after later DOM changes.
- Large mutation volumes still have runtime cost despite bounded history and
  deduplication.

## Browser compatibility

The package targets the latest two releases of Chrome, Firefox, Safari, and
Edge. Internet Explorer is not supported.

## Roadmap

See the [product roadmap](docs/ROADMAP.md) for milestones and recommended
implementation order.

## License

This project is released under the MIT License.
