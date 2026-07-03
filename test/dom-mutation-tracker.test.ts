const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test") as typeof import("node:test");
const { JSDOM } = require("jsdom");

interface MutationLogEntry {
  timestamp: string;
  type: MutationRecordType;
  target: Node;
  selector: string;
  mutation: MutationRecord;
  attributeName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  addedNodes?: Node[];
  removedNodes?: Node[];
}

interface TrackerWindow {
  document: Document;
  console: Console;
  Date: DateConstructor;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  eval(source: string): unknown;
  close(): void;
  startMutationTracker(): void;
  stopMutationTracker(): void;
  clearMutationLog(): void;
  getMutationLog(): MutationLogEntry[];
}

interface TrackerHarness {
  window: TrackerWindow;
  collapsedGroups: string[];
  errors: unknown[][];
  warnings: unknown[][];
}

const trackerSource = fs.readFileSync(
  path.join(__dirname, "..", "dom-mutation-tracker.js"),
  "utf8",
);

function loadTracker(body: string, controlledTimers = false): TrackerHarness {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: "outside-only",
  });
  const window = dom.window as unknown as TrackerWindow;
  const collapsedGroups: string[] = [];
  const errors: unknown[][] = [];
  const warnings: unknown[][] = [];

  Object.assign(window.console, {
    group() {},
    groupCollapsed(message: string) {
      collapsedGroups.push(message);
    },
    groupEnd() {},
    log() {},
    warn(...args: unknown[]) {
      warnings.push(args);
    },
    error(...args: unknown[]) {
      errors.push(args);
    },
  });

  if (controlledTimers) {
    window.Date = Date;
    window.setTimeout = ((callback: () => void, delay?: number) =>
      setTimeout(callback, delay)) as unknown as typeof setTimeout;
    window.clearTimeout = ((timer: number) =>
      clearTimeout(
        timer as unknown as ReturnType<typeof setTimeout>,
      )) as unknown as typeof clearTimeout;
  } else {
    window.setTimeout = (() => 0) as unknown as typeof setTimeout;
  }

  window.eval(trackerSource);

  return { window, collapsedGroups, errors, warnings };
}

function closeTracker(harness: TrackerHarness): void {
  harness.window.stopMutationTracker();
  harness.window.close();
}

function requireElement(document: Document, selector: string): Element {
  const element = document.querySelector(selector);
  assert.ok(element, `Expected ${selector} to exist`);
  return element;
}

async function flushMutations(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("generates useful selectors and descriptions for HTML and SVG", async () => {
  const harness = loadTracker(`
    <div id="normal" class="card primary"></div>
    <svg id="icon:main" class="diagram state:on">
      <circle id="node.1" class="shape selected"></circle>
      <ellipse class=""></ellipse>
    </svg>
  `);
  const { document } = harness.window;
  const targets = [
    requireElement(document, "#normal"),
    requireElement(document, "svg"),
    requireElement(document, "circle"),
    requireElement(document, "ellipse"),
  ];

  targets.forEach((target) => target.setAttribute("data-state", "changed"));
  await flushMutations();

  const mutationLog = harness.window
    .getMutationLog()
    .filter((entry) => entry.attributeName === "data-state");

  assert.equal(mutationLog.length, targets.length);
  mutationLog.forEach((entry, index) => {
    assert.equal(document.querySelector(entry.selector), targets[index]);
  });
  assert.match(mutationLog[1].selector, /#icon\\:main\.diagram\.state\\:on/);
  assert.match(mutationLog[2].selector, /#node\\\.1\.shape\.selected/);
  assert.match(mutationLog[3].selector, /^ellipse:nth-child\(2\)$/);
  assert.ok(
    harness.collapsedGroups.includes("🔧 data-state → div#normal.card"),
  );
  assert.equal(harness.errors.length, 0);

  closeTracker(harness);
});

test("handles detached elements and text-node targets", async () => {
  const harness = loadTracker(`
    <section id="host">
      <div id="detached" class="item"></div>
      <p id="text">before</p>
    </section>
  `);
  const { document } = harness.window;
  const detached = requireElement(document, "#detached");
  const paragraph = requireElement(document, "#text");
  const text = paragraph.firstChild;
  assert.ok(text);

  detached.setAttribute("data-state", "changed");
  detached.remove();
  text.textContent = "after";
  await flushMutations();

  const mutationLog = harness.window.getMutationLog();
  const attributeEntry = mutationLog.find(
    (entry) => entry.attributeName === "data-state",
  );
  const textEntry = mutationLog.find((entry) => entry.type === "characterData");

  assert.equal(attributeEntry?.selector, "div#detached.item:nth-child(0)");
  assert.equal(textEntry?.selector, "unknown");
  assert.equal(textEntry?.oldValue, "before");
  assert.equal(textEntry?.newValue, "after");
  assert.ok(
    harness.collapsedGroups.some((message) =>
      message.startsWith("Text → p#text"),
    ),
  );
  assert.equal(harness.errors.length, 0);

  closeTracker(harness);
});

test("normalizes attribute, child-list, and character-data records in order", async () => {
  const harness = loadTracker(`
    <div id="attribute"></div>
    <ul id="list"></ul>
    <p id="text">before</p>
  `);
  const { document } = harness.window;
  const attributeTarget = requireElement(document, "#attribute");
  const listTarget = requireElement(document, "#list");
  const textTarget = requireElement(document, "#text").firstChild;
  const addedNode = document.createElement("li");
  assert.ok(textTarget);

  attributeTarget.setAttribute("data-state", "new");
  listTarget.appendChild(addedNode);
  textTarget.textContent = "after";
  await flushMutations();

  const mutationLog = harness.window.getMutationLog();
  assert.deepEqual(
    Array.from(mutationLog, (entry) => entry.type),
    ["attributes", "childList", "characterData"],
  );
  assert.deepEqual(
    {
      attributeName: mutationLog[0].attributeName,
      oldValue: mutationLog[0].oldValue,
      newValue: mutationLog[0].newValue,
    },
    { attributeName: "data-state", oldValue: null, newValue: "new" },
  );
  assert.equal(mutationLog[1].addedNodes?.length, 1);
  assert.equal(mutationLog[1].addedNodes?.[0], addedNode);
  assert.equal(mutationLog[1].removedNodes?.length, 0);
  assert.deepEqual(
    { oldValue: mutationLog[2].oldValue, newValue: mutationLog[2].newValue },
    { oldValue: "before", newValue: "after" },
  );

  closeTracker(harness);
});

test("deduplicates mutations inside the configured time window", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
  const harness = loadTracker('<div id="target"></div>', true);
  const target = requireElement(harness.window.document, "#target");

  target.classList.add("mutation-tracker-highlight");
  target.setAttribute("data-state", "first");
  target.setAttribute("data-state", "second");
  await flushMutations();
  assert.equal(
    harness.window
      .getMutationLog()
      .filter((entry) => entry.attributeName === "data-state").length,
    1,
  );

  t.mock.timers.setTime(1_049);
  target.setAttribute("data-state", "third");
  await flushMutations();
  assert.equal(
    harness.window
      .getMutationLog()
      .filter((entry) => entry.attributeName === "data-state").length,
    1,
  );

  t.mock.timers.setTime(1_050);
  target.setAttribute("data-state", "fourth");
  await flushMutations();
  assert.equal(
    harness.window
      .getMutationLog()
      .filter((entry) => entry.attributeName === "data-state").length,
    2,
  );

  closeTracker(harness);
});

test("keeps the newest 100 mutations in recording order", async () => {
  const harness = loadTracker('<div id="target"></div>');
  const target = requireElement(harness.window.document, "#target");

  for (let index = 0; index <= 100; index += 1) {
    target.setAttribute(`data-${index}`, String(index));
  }
  await flushMutations();

  const mutationLog = harness.window.getMutationLog();
  assert.equal(mutationLog.length, 100);
  assert.equal(mutationLog[0].attributeName, "data-1");
  assert.equal(mutationLog[99].attributeName, "data-100");

  closeTracker(harness);
});

test("start, stop, restart, and clear are safe and clean up observation", async () => {
  const harness = loadTracker('<div id="target"></div>');
  const { document } = harness.window;
  const target = requireElement(document, "#target");

  assert.equal(
    document.querySelectorAll("style[data-mutation-tracker]").length,
    1,
  );
  harness.window.startMutationTracker();
  assert.equal(harness.warnings.length, 1);

  target.setAttribute("data-first", "tracked");
  await flushMutations();
  assert.equal(harness.window.getMutationLog().length, 1);

  harness.window.stopMutationTracker();
  assert.equal(
    document.querySelectorAll("style[data-mutation-tracker]").length,
    0,
  );
  target.setAttribute("data-stopped", "ignored");
  await flushMutations();
  assert.equal(harness.window.getMutationLog().length, 1);

  harness.window.startMutationTracker();
  target.setAttribute("data-restarted", "tracked");
  await flushMutations();
  assert.equal(harness.window.getMutationLog().length, 2);

  harness.window.clearMutationLog();
  assert.equal(harness.window.getMutationLog().length, 0);
  harness.window.clearMutationLog();
  harness.window.stopMutationTracker();
  harness.window.stopMutationTracker();
  assert.equal(harness.warnings.length, 2);

  harness.window.close();
});

test("ignores tracker-owned mutations without dropping later records", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const harness = loadTracker('<div id="target"></div>', true);
  const target = requireElement(harness.window.document, "#target");

  target.classList.add("mutation-tracker-highlight");
  target.setAttribute("data-first", "one");
  target.setAttribute("data-second", "two");
  await flushMutations();

  const mutationLog = harness.window.getMutationLog();
  assert.deepEqual(
    Array.from(mutationLog, (entry) => entry.attributeName),
    ["data-first", "data-second"],
  );

  closeTracker(harness);
});

test("uses deterministic timers for highlight cleanup", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const harness = loadTracker('<div id="target"></div>', true);
  const target = requireElement(harness.window.document, "#target");

  target.setAttribute("data-state", "changed");
  await flushMutations();
  assert.ok(target.classList.contains("mutation-tracker-highlight"));

  t.mock.timers.tick(2_999);
  assert.ok(target.classList.contains("mutation-tracker-highlight"));
  t.mock.timers.tick(1);
  assert.ok(target.classList.contains("mutation-tracker-highlight-fade-out"));
  t.mock.timers.tick(300);
  assert.equal(
    target.classList.contains("mutation-tracker-highlight-fade-out"),
    false,
  );

  closeTracker(harness);
});

test("continues processing a mutation batch after an unusual target fails", async () => {
  const harness = loadTracker(`
    <div id="unusual"></div>
    <div id="later"></div>
  `);
  const { document } = harness.window;
  const unusual = requireElement(document, "#unusual");
  const later = requireElement(document, "#later");
  const setUnusualAttribute = unusual.setAttribute.bind(unusual);

  unusual.getAttribute = () => {
    throw new Error("unusual target");
  };
  setUnusualAttribute("data-state", "changed");
  later.setAttribute("data-state", "changed");
  await flushMutations();

  const mutationLog = harness.window
    .getMutationLog()
    .filter((entry) => entry.attributeName === "data-state");

  assert.equal(mutationLog.length, 1);
  assert.equal(mutationLog[0].target, later);
  assert.equal(harness.errors.length, 1);
  assert.equal(harness.errors[0][0], "Failed to process DOM mutation:");

  closeTracker(harness);
});
