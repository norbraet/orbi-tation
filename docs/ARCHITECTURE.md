# v2 Architecture and Public API

Status: accepted and implemented by the v2 package restructure in
[#2](https://github.com/norbraet/dom-mutation-tracker/issues/2).

This document records the contract established by
[#22](https://github.com/norbraet/dom-mutation-tracker/issues/22). Changes to
the public types or dependency direction require an explicit follow-up
decision.

## Goals

- Keep mutation observation framework-agnostic and independent from its UI.
- Make npm imports side-effect-free and safe in non-browser build pipelines.
- Emit bounded, serializable events instead of exposing native
  `MutationRecord` objects.
- Require explicit initialization so applications own tracker lifecycle and
  production inclusion.
- Leave room for filters, structured diffs, redaction, and diagnostics without
  putting those features in the initial contract.

## Module boundaries

The maintained source has two one-way layers and a side-effect-free package
entry:

```text
src/index.ts ───────────────> src/core/
src/panel/ ─────────────────> src/core/
```

### Core

`src/core/` owns observation, lifecycle state, event normalization, bounded
history, deduplication, selectors, and subscriptions. It may use browser DOM
APIs, but it must not import the panel. It has no runtime dependency on a UI
framework.

### Panel

`src/panel/` owns rendering, console presentation, highlighting, and other
visual interaction. It receives a tracker instance and consumes its public
methods; it never reads core internals. The panel may import public types from
the core.

The panel will render into an **open ShadowRoot**. Shadow DOM provides style
isolation, while an open root keeps accessibility inspection, automated tests,
and host-page debugging practical. The root is not a security boundary.

The dependency direction is one-way: panel may import core; core never imports
panel. No entry may auto-start tracking or publish browser globals.

## npm public API

Importing the package creates no observer, inserts no styles or elements, and
does not access `document`. Consumers opt in by creating and starting a tracker:

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

The initial public surface is:

```ts
export function createTracker(options?: TrackerOptions): Tracker;

export interface Tracker {
  start(): void;
  stop(): void;
  clear(): void;
  getEvents(): readonly TrackerMutationEvent[];
  subscribe(listener: TrackerEventListener): () => void;
}

export type TrackerEventListener = (event: TrackerMutationEvent) => void;

export interface TrackerOptions {
  root?: Node;
  maxEvents?: number;
  dedupeWindowMs?: number;
  onError?: (error: TrackerError) => void;
}
```

Defaults:

- `root`: `document.body`, resolved when `start()` is called
- `maxEvents`: `100`
- `dedupeWindowMs`: `50`
- `onError`: report to `console.error`

`root` is part of the contract here. Issue #5 expands configurable-root
behavior and coverage. More observation and filtering options may be added by
their owning issues without changing the lifecycle API.

### Option ownership

Core options affect observation or event data. Panel options affect only
presentation.

| Core                                              | Panel                                           |
| ------------------------------------------------- | ----------------------------------------------- |
| observation root and native observer options      | mount target and initial visibility             |
| history limit and deduplication window            | theme, placement, dimensions, and Shadow DOM UI |
| include/exclude filters                           | highlighting color, duration, and enablement    |
| redaction, serialization, and diagnostic settings | timeline display and interaction preferences    |
| error callback                                    | panel-specific error presentation               |

The core must never add highlight classes, styles, or panel DOM. Tracker-owned
UI mutations are filtered at the integration boundary so they do not enter the
event stream.

## Event model

The name `TrackerMutationEvent` intentionally avoids the browser's legacy
`MutationEvent` type. Every public event is JSON-serializable and contains no
`Node`, `Element`, `MutationRecord`, function, or cyclic reference.

```ts
export type TrackerMutationEvent =
  | TrackerAttributeEvent
  | TrackerChildListEvent
  | TrackerCharacterDataEvent;

export interface TrackerEventBase {
  sequence: number;
  timestamp: string;
  target: TrackerTarget;
}

export interface TrackerTarget {
  nodeType: number;
  selector: string;
  description: string;
}

export interface TrackerNodeSummary {
  nodeType: number;
  name: string;
  description: string;
}

export interface TrackerAttributeEvent extends TrackerEventBase {
  type: "attributes";
  attributeName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface TrackerChildListEvent extends TrackerEventBase {
  type: "childList";
  addedNodes: readonly TrackerNodeSummary[];
  removedNodes: readonly TrackerNodeSummary[];
}

export interface TrackerCharacterDataEvent extends TrackerEventBase {
  type: "characterData";
  oldValue: string | null;
  newValue: string | null;
}
```

Event guarantees:

- `sequence` is a monotonically increasing integer within one tracker instance.
- `timestamp` is an ISO 8601 UTC string captured during normalization.
- Events and nested summaries are immutable after publication.
- Events are appended and delivered to subscribers in observer-record order.
- `getEvents()` returns a new readonly array snapshot; callers cannot mutate
  internal history.
- The oldest event is discarded when `maxEvents` is exceeded.
- Node summaries are deliberately compact. Rich diffs, redaction, and export
  schema versioning belong to #11, #28, and #7 respectively.

The core may keep private weak references for future locate behavior, but those
references are not part of the public event and must not affect serialization.

## Lifecycle and errors

`createTracker()` validates supplied options synchronously but performs no DOM
work. Invalid option types throw `TypeError`; invalid numeric ranges throw
`RangeError`.

Lifecycle calls have these semantics:

| Call            | Semantics                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| `start()`       | Resolve the root, create the observer, and begin recording. Idempotent.    |
| `stop()`        | Disconnect the observer and release active timers. Idempotent.             |
| `clear()`       | Clear event history and dedupe state without changing running state.       |
| `getEvents()`   | Return a snapshot in recording order. Valid in every lifecycle state.      |
| `subscribe(fn)` | Register before or after start; return an idempotent unsubscribe function. |

Stopping does not clear history or subscribers. Restarting or clearing the same
instance does not reset its sequence counter, so event identifiers are not
reused.

`start()` throws a `TrackerError` when no root can be resolved or
`MutationObserver` is unavailable. `subscribe()` throws `TypeError` for a
non-function listener.

Runtime failures associated with one mutation record or subscriber must not
stop later records or listeners. They are reported through `onError` as a
`TrackerError` with a stable code and the original cause when available:

```ts
export type TrackerErrorCode =
  | "MISSING_ROOT"
  | "UNSUPPORTED_ENVIRONMENT"
  | "NORMALIZATION_FAILED"
  | "LISTENER_FAILED";

export class TrackerError extends Error {
  readonly code: TrackerErrorCode;
  readonly cause?: unknown;
}
```

If no `onError` callback is configured, the default reporter uses
`console.error`. If the error callback itself throws, that exception is
re-thrown asynchronously so it is visible without aborting the observer batch.

## Packaging and compatibility decisions

- The package ships ESM, CJS, declaration, and source-map outputs.
- ESM is the primary documented npm format. CJS is supported for v2 and may be
  reconsidered only in a future major version.
- Package modules target ES2022 and current evergreen browsers that support
  `MutationObserver`.
- Every package entry is side-effect-free. Consumers explicitly create, mount,
  start, stop, and unmount the features they use.
- Auto-starting global bundles and browser globals are deliberate non-goals so
  the package has one lifecycle and integration model.
- Development-only integration uses a compile-time host-application guard
  around dynamic package imports. A production build fixture verifies that
  both core and panel code are removed when that guard is `false`.
- The package does not infer whether the host is running in production. An
  explicitly imported and started tracker remains usable in any environment;
  this keeps the core bundler-neutral and makes production exclusion the host
  build's deliberate responsibility.
- The core has no runtime dependency unless a later issue documents a concrete
  browser-platform gap that cannot reasonably be handled internally.
- Advanced diagnostics, stack capture, screenshots, and framework adapters are
  opt-in and outside the initial core defaults.

## Deferred decisions

The following are intentionally owned by later issues:

- exact filter syntax (#6)
- export format and schema versioning (#7)
- panel layout and interaction details (#8 and #9)
- structured before/after diffs (#11)
- stack attribution (#12)
- safe serialization and redaction defaults (#28)
