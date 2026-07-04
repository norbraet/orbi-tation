import { execFileSync } from "node:child_process";
import os from "node:os";
import { chromium } from "@playwright/test";
import { startFixtureServer } from "../test/browser/server.mjs";

const measuredRuns = 3;
const warmupRuns = 1;
const scenarioNames = [
  "lowVolume",
  "burstyUpdates",
  "largeSubtree",
  "longRunning",
  "panelPresentation",
];
const initialBudgets = {
  lowVolumeAverageLatencyMs: 1,
  burstyBatchMs: 50,
  largeSubtreeBatchMs: 100,
  longRunningBatchMs: 250,
  panelOverheadMsPerMutation: 1,
  retainedHeapDeltaBytes: 16 * 1024 * 1024,
  retainedEventCount: 200,
  retainedSerializedBytes: 256 * 1024,
};

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function aggregate(runs) {
  const numericKeys = Object.keys(runs[0]).filter((key) =>
    runs.every((run) => typeof run[key] === "number"),
  );

  return Object.fromEntries(
    numericKeys.map((key) => [key, median(runs.map((run) => run[key]))]),
  );
}

async function heapSize(client) {
  await client.send("HeapProfiler.collectGarbage");
  const usage = await client.send("Runtime.getHeapUsage");
  return usage.usedSize;
}

async function runScenario(browser, baseUrl, scenario) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  try {
    await page.goto(`${baseUrl}/test/benchmark/fixture.html`);
    await page.waitForFunction(() => globalThis.benchmarkReady === true);
    const heapBeforeBytes = await heapSize(client);
    const measurement = await page.evaluate((name) => {
      return globalThis.runTrackerBenchmark(name);
    }, scenario);
    const heapAfterBytes = await heapSize(client);

    return {
      ...measurement,
      heapBeforeBytes,
      heapAfterBytes,
      retainedHeapDeltaBytes: heapAfterBytes - heapBeforeBytes,
    };
  } finally {
    await context.close();
  }
}

execFileSync("npm", ["run", "build"], { stdio: "ignore" });

const server = await startFixtureServer({ port: 0 });
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Benchmark fixture server did not expose a TCP address");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-precise-memory-info"],
});

try {
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const scenarios = {};

  for (const scenario of scenarioNames) {
    for (let run = 0; run < warmupRuns; run += 1) {
      await runScenario(browser, baseUrl, scenario);
    }

    const runs = [];
    for (let run = 0; run < measuredRuns; run += 1) {
      runs.push(await runScenario(browser, baseUrl, scenario));
    }
    scenarios[scenario] = { median: aggregate(runs), runs };
  }

  const longRunning = scenarios.longRunning.median;
  if (longRunning.retainedEventCount !== initialBudgets.retainedEventCount) {
    throw new Error(
      `Expected a bounded ${initialBudgets.retainedEventCount}-event buffer; received ${longRunning.retainedEventCount}`,
    );
  }

  const maximumHeapDeltaBytes = Math.max(
    ...Object.values(scenarios).map(
      (scenario) => scenario.median.retainedHeapDeltaBytes,
    ),
  );
  const budgetObservations = [
    {
      metric: "lowVolume.averageLatencyMs",
      actual: scenarios.lowVolume.median.averageLatencyMs,
      budget: initialBudgets.lowVolumeAverageLatencyMs,
    },
    {
      metric: "burstyUpdates.durationMs",
      actual: scenarios.burstyUpdates.median.durationMs,
      budget: initialBudgets.burstyBatchMs,
    },
    {
      metric: "largeSubtree.durationMs",
      actual: scenarios.largeSubtree.median.durationMs,
      budget: initialBudgets.largeSubtreeBatchMs,
    },
    {
      metric: "longRunning.durationMs",
      actual: longRunning.durationMs,
      budget: initialBudgets.longRunningBatchMs,
    },
    {
      metric: "panelPresentation.panelOverheadMsPerMutation",
      actual: scenarios.panelPresentation.median.panelOverheadMsPerMutation,
      budget: initialBudgets.panelOverheadMsPerMutation,
    },
    {
      metric: "maximumRetainedHeapDeltaBytes",
      actual: maximumHeapDeltaBytes,
      budget: initialBudgets.retainedHeapDeltaBytes,
    },
    {
      metric: "longRunning.retainedSerializedBytes",
      actual: longRunning.retainedSerializedBytes,
      budget: initialBudgets.retainedSerializedBytes,
    },
  ].map((observation) => ({
    ...observation,
    withinBudget: observation.actual <= observation.budget,
  }));

  const browserVersion = browser.version();
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      browser: `Chromium ${browserVersion}`,
      headless: true,
    },
    configuration: { warmupRuns, measuredRuns },
    budgets: initialBudgets,
    budgetObservations,
    scenarios,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
