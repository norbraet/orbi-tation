# Product Roadmap

## Vision

Build `orbi-tation` as a framework-agnostic frontend debugging tool
installed as a development dependency and initialized explicitly by the host
application.

The product should help a developer answer:

1. **What changed?** — normalized mutation events and structured before/after
   diffs.
2. **Where did it change?** — stable target descriptions and click-to-locate
   behavior.
3. **When and how often?** — a live timeline, burst grouping, and hot-element
   metrics.
4. **Who likely caused it?** — opt-in, best-effort call-site attribution with
   honest unknown states.

## Product principles

- The core is framework-agnostic and does not depend on the panel.
- npm imports are explicit and side-effect-free.
- Applications own initialization and cleanup; the package does not auto-start
  or publish browser globals.
- Installing the package as a `devDependency` is not treated as production
  protection. Production exclusion must be documented and tested.
- Tracker UI and highlighting must not pollute the mutation stream.
- Expensive diagnostics are measured, bounded, and opt-in until proven safe.
- Serialized data is versioned, bounded, and passed through a shared redaction
  pipeline.
- Browser limitations are documented rather than hidden.

## Accepted architecture direction

The public contract is recorded in the
[v2 architecture and public API decision](ARCHITECTURE.md). The product is
separated into two layers with one-way dependencies:

1. **Core engine** — observes DOM mutations and emits normalized, serializable
   events.
2. **Panel** — subscribes to the core and renders the debugging experience in
   an isolated Shadow DOM.

Importing any package entry must not start an observer or modify the page.

## Milestone strategy

Milestones are outcome-based delivery gates, not date buckets. Detailed scope,
acceptance criteria, and direct dependency links live in the GitHub issues.

### [M1 — Architecture & Package Foundation](https://github.com/norbraet/orbi-tation/milestone/1)

Goal: establish the public API, package structure, tests, production-safe
integration, and performance baseline required for feature work.

Recommended order:

1. #22 — architecture, lifecycle API, and event model
2. #3 and #24 — unit and browser test harnesses
3. #1 — SVG selector regression fix
4. #2 — TypeScript package and ESM/CJS builds
5. #23 and #27 — production safety and performance budgets
6. #4 — complete CI gate

Exit gate: the side-effect-free typed package builds successfully, tests and CI
pass, and production/performance expectations are verified.

### [M2 — Panel MVP & First npm Release](https://github.com/norbraet/orbi-tation/milestone/2)

Goal: ship the first useful logging-buddy experience and a validated npm
release.

Recommended order:

1. #5 — configurable observation root
2. #6 — include/exclude filters
3. #8 — isolated panel shell
4. #9 — live filterable timeline
5. #10 and #28 — locate behavior and safe serialization
6. #11 and #15 — structured diffs and burst grouping
7. #7 — versioned JSON export
8. #25 — npm documentation and example app
9. #26 — validated first npm release

Exit gate: developers can install the package, open an isolated panel, inspect
and filter bounded mutation events, view useful diffs, locate affected elements,
export safely, and keep the tracker out of production using a tested pattern.

### [M3 — Attribution & Advanced Diagnostics](https://github.com/norbraet/orbi-tation/milestone/3)

Goal: deepen diagnostics after the MVP is stable.

Recommended order:

1. #12 — best-effort mutation call-site attribution
2. #13 — stack presentation and DevTools handoff
3. #14, #16, and #17 — hot-element metrics, open Shadow DOM observation, and
   recorded session inspection once their dependencies are complete

Exit gate: advanced features remain bounded, clean up after themselves, meet
the established performance expectations, and communicate platform limits
honestly.

### [M4 — Evidence-Gated Extensions](https://github.com/norbraet/orbi-tation/milestone/4)

Goal: evaluate optional investments only after real MVP usage.

- #18 — optional React and Vue adapters
- #19 — visual thumbnail snapshots
- #20 — panel naming or persona

These are research and decision issues rather than promised features. A
documented no-go decision is a valid completion.

## Decisions already made

- Ship side-effect-free ESM and CJS package entries only.
- Keep the core framework-agnostic.
- Use structured DOM diffs as the default snapshot approach.
- Defer rasterized thumbnails until their value and cost are demonstrated.
- Treat stack attribution as best-effort rather than guaranteed.
- Treat timeline replay as inspection first, not as reapplying mutations to the
  page.

## Architecture decisions

The accepted #22 decision defines:

- `createTracker(options)` and the tracker lifecycle methods.
- A serializable `TrackerMutationEvent` discriminated union.
- Explicit initialization with no auto-start or browser globals.
- ES2022 package modules and CJS support for v2.
- A default 100-event limit with advanced diagnostics kept opt-in.
- An open ShadowRoot for panel isolation, accessibility inspection, and
  testability.

## v2 success criteria

A frontend developer can install the package for local development, initialize
it explicitly, open an isolated panel, filter and inspect bounded mutation
events with useful diffs, locate affected elements, and exclude the tool from a
production build using a documented and tested pattern.

## Planning sources

- [Master roadmap issue #21](https://github.com/norbraet/orbi-tation/issues/21)
- [All GitHub issues](https://github.com/norbraet/orbi-tation/issues)
- This document preserves durable product intent and delivery order.
- GitHub issues and milestones contain the current task status, acceptance
  criteria, and dependency graph.
