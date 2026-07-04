# Unit test scope

`npm test` runs the TypeScript unit suite once with Node's built-in test runner.
Node 24 executes erasable TypeScript syntax directly, and its mock-timer API
provides deterministic clock and highlight-timer coverage without another test
framework dependency. jsdom supplies DOM APIs for the typed core and panel
presentation.

The unit suite owns fast coverage for:

- HTML, SVG, detached-node, text-node, and CSS-special selector behavior
- attribute, child-list, and character-data normalization and ordering
- deduplication timing and bounded log history
- lifecycle idempotency, restart, clear, and observer cleanup
- filtering of tracker-owned mutations
- option validation and per-record/listener error isolation
- side-effect-free package imports and explicit lifecycle control
- regressions for fixed bugs, beginning with the SVG failure from #1

Every bug fix should add or extend a focused unit regression here. Tests for
new event fields, options, filters, and lifecycle behavior should land with the
feature that introduces them.

## Intentionally left to browser tests

Issue #24 owns behavior that jsdom cannot validate with enough confidence:

- cross-browser `MutationObserver` delivery and scheduling
- rendered highlighting, layout, and CSS behavior
- real Shadow DOM isolation, focus, keyboard, and accessibility interaction
- panel mounting and cleanup in an application fixture
- app-framework-driven mutation flows
- Chromium integration in CI and later Firefox/WebKit coverage
- traces and screenshots captured on browser-test failure

The unit suite may model these boundaries, but browser compatibility claims
must come from the end-to-end harness.
