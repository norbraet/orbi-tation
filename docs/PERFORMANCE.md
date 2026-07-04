# Performance baseline and budgets

Status: initial baseline established by
[#27](https://github.com/norbraet/orbi-tation/issues/27).

Performance results are evidence for engineering decisions, not promises that
every host page or machine will produce the same numbers. Run the benchmark on
the same environment before and after a change when comparing overhead.

## Run the benchmark

Install Chromium once, then emit the versioned JSON result:

```bash
npm run test:browser:install
npm run --silent benchmark
```

Redirect the second command when a result artifact is needed:

```bash
npm run --silent benchmark > /tmp/orbi-tation-benchmark.json
```

The command builds the package, starts the local static fixture server, runs one
warmup plus three measured runs per scenario, reports medians and individual
runs, then exits. Budget comparisons in the JSON are informational. The command
fails only when the harness cannot run or a correctness invariant such as the
configured event-buffer bound is violated.

## Initial reference environment

Recorded 2026-07-04 with:

- Node.js 24.11.0
- headless Chromium 149.0.7827.55 from Playwright 1.61.1
- macOS Darwin 24.6.0 on Apple M4, arm64
- 10 logical CPUs and 32 GiB memory

Browser timing uses `performance.now()`. Retained JavaScript heap is read
through the Chromium DevTools Protocol after a forced garbage collection before
and after each scenario. Heap deltas include the scenario DOM and the full
retained event graph, so comparisons must use the same fixture and browser.

## Workloads and baseline

| Scenario                   | Workload                                            | Initial median                       |
| -------------------------- | --------------------------------------------------- | ------------------------------------ |
| Low volume                 | 25 separately delivered attribute mutations         | 0.020 ms average end-to-end latency  |
| Bursty framework-style     | 600 attribute/class/text records in one update      | 10.8 ms batch; 0.018 ms per mutation |
| Large subtree              | 1,000 leaf updates across a 1,100-node subtree      | 3.7 ms batch; 0.0037 ms per mutation |
| Long running               | 20 batches and 2,000 events with `maxEvents: 200`   | 17.8 ms; 200 events and 43,745 bytes |
| Current panel presentation | 200 targets with highlighting and no-op console I/O | 0.5 ms total incremental cost        |
| Retained heap              | Maximum median delta across the scenarios           | 151,696 bytes                        |

The current panel entry provides console/highlight presentation rather than the
future Shadow DOM timeline. Issue #8 must extend the panel scenario to include
shell rendering before that UI ships.

## Initial budgets

These deliberately leave headroom for slower development machines and normal
measurement noise. They are review triggers, not shared-CI pass/fail gates.

| Metric                                      | Initial budget |
| ------------------------------------------- | -------------- |
| Low-volume average latency                  | 1 ms/event     |
| 600-event burst duration                    | 50 ms          |
| 1,000-event large-subtree duration          | 100 ms         |
| 2,000-event long-running duration           | 250 ms         |
| Current panel incremental presentation cost | 1 ms/event     |
| Retained heap delta                         | 16 MiB         |
| Long-running retained event count           | 200 events     |
| Long-running serialized event payload       | 256 KiB        |

`maxEvents` is the bounded-history replacement for the old `maxLogEntries`
name. The long-running fixture verifies that 2,000 delivered events retain only
the newest 200. Its heap and serialized-size measurements include every nested
value reachable from those events. Future snapshots, stacks, and diffs must
remain inside the configured bound rather than creating an unbounded side
channel.

## Policy for expensive diagnostics

Stack attribution, richer snapshots, visual thumbnails, timeline rendering,
and similar diagnostics must extend the representative fixture and report their
incremental timing, retained heap, and payload cost before they can be enabled
by default. A feature that exceeds an initial budget must remain opt-in or land
with an explicit, evidence-backed budget revision. Do not relax a budget merely
to make one machine's result green.
