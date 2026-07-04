# Browser test scope

Run the focused Chromium suite with:

```bash
npm run test:browser:install
npm run test:browser
```

Playwright starts the static fixture server and exercises the built ESM package
in Chromium. The suite covers real `MutationObserver` delivery, lifecycle
cleanup, event ordering, tracker-owned highlighting exclusion, panel
presentation cleanup, and the SVG regression.

Screenshots and traces are retained only for failed tests under `test-results/`.
CI runs one Chromium worker for deterministic resource use.

The fixture already includes an open Shadow DOM mutation control. Observation
inside open shadow roots is deferred to #16. Isolated Shadow DOM panel-shell
assertions must land with #8, which owns the actual shell; the current panel
entry provides console/highlight presentation only.

Firefox and WebKit projects should be added after the Chromium suite is stable
and CI runtime is measured in #27.

## Performance benchmarks

Run the separate informational benchmark suite with:

```bash
npm run --silent benchmark
```

It reuses this static server and Chromium installation but emits JSON instead
of test-runner output. Timing and memory budgets are documented in
[the performance baseline](../../docs/PERFORMANCE.md); shared CI does not fail
on machine-speed thresholds.
