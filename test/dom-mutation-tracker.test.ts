import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

import {
  createTracker,
  getElementSelector,
  getShortElementDescription,
  TrackerError,
  type Tracker,
  type TrackerMutationEvent,
} from "../dist/index.js";
import { createPanel } from "../dist/panel.js";

interface Harness {
  readonly dom: JSDOM;
  readonly tracker: Tracker;
}

interface StandaloneWindow extends Window {
  DOMMutationTracker: {
    start(): void;
    stop(): void;
    clear(): void;
    getEvents(): readonly TrackerMutationEvent[];
  };
  startMutationTracker(): void;
  stopMutationTracker(): void;
  clearMutationLog(): void;
  getMutationLog(): readonly TrackerMutationEvent[];
}

function createHarness(
  body: string,
  options: { maxEvents?: number; dedupeWindowMs?: number } = {},
): Harness {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: "outside-only",
  });
  const tracker = createTracker({ root: dom.window.document.body, ...options });
  tracker.start();
  return { dom, tracker };
}

function closeHarness(harness: Harness): void {
  harness.tracker.stop();
  harness.dom.window.close();
}

function requireElement(document: Document, selector: string): Element {
  const element = document.querySelector(selector);
  assert.ok(element, `Expected ${selector} to exist`);
  return element;
}

async function flushMutations(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("generates useful selectors and descriptions for HTML, SVG, and text", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="normal" class="card primary"><span>text</span></div>
    <svg id="icon:main" class="diagram state:on">
      <circle id="node.1" class="shape selected"></circle>
      <ellipse class=""></ellipse>
    </svg>
  </body>`);
  const { document } = dom.window;
  const normal = requireElement(document, "#normal");
  const svg = requireElement(document, "svg");
  const circle = requireElement(document, "circle");
  const ellipse = requireElement(document, "ellipse");
  const text = requireElement(document, "span").firstChild;
  assert.ok(text);

  assert.equal(
    getElementSelector(normal),
    "div#normal.card.primary:nth-child(1)",
  );
  assert.equal(document.querySelector(getElementSelector(svg)), svg);
  assert.equal(document.querySelector(getElementSelector(circle)), circle);
  assert.equal(getElementSelector(ellipse), "ellipse:nth-child(2)");
  assert.match(getElementSelector(svg), /#icon\\:main\.diagram\.state\\:on/);
  assert.match(getElementSelector(circle), /#node\\\.1\.shape\.selected/);
  assert.equal(getElementSelector(text), "span:nth-child(1)");
  assert.equal(getShortElementDescription(normal), "div#normal.card");
  assert.equal(getShortElementDescription(text), "span");

  const detached = document.createElement("div");
  detached.id = "detached";
  detached.className = "item";
  assert.equal(getElementSelector(detached), "div#detached.item");
  dom.window.close();
});

test("normalizes serializable attribute, child-list, and character-data events in order", async () => {
  const harness = createHarness(
    '<div id="attribute"></div><ul id="list"></ul><p id="text">before</p>',
    { dedupeWindowMs: 0 },
  );
  const { document } = harness.dom.window;
  const attributeTarget = requireElement(document, "#attribute");
  const listTarget = requireElement(document, "#list");
  const textTarget = requireElement(document, "#text").firstChild;
  assert.ok(textTarget);

  attributeTarget.setAttribute("data-state", "new");
  const addedNode = document.createElement("li");
  listTarget.appendChild(addedNode);
  textTarget.textContent = "after";
  await flushMutations();

  const events = harness.tracker.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ["attributes", "childList", "characterData"],
  );
  assert.deepEqual(events[0], {
    sequence: 1,
    timestamp: events[0]?.timestamp,
    target: {
      nodeType: 1,
      selector: "div#attribute:nth-child(1)",
      description: "div#attribute",
    },
    type: "attributes",
    attributeName: "data-state",
    oldValue: null,
    newValue: "new",
  });
  assert.deepEqual(
    events[1]?.type === "childList" ? events[1].addedNodes : null,
    [{ nodeType: 1, name: "li", description: "li" }],
  );
  assert.deepEqual(
    events[2]?.type === "characterData"
      ? { oldValue: events[2].oldValue, newValue: events[2].newValue }
      : null,
    { oldValue: "before", newValue: "after" },
  );
  assert.doesNotThrow(() => JSON.stringify(events));
  assert.ok(Object.isFrozen(events[0]));
  assert.ok(Object.isFrozen(events[0]?.target));

  closeHarness(harness);
});

test("deduplicates records inside the configured time window", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  const harness = createHarness('<div id="target"></div>');
  const target = requireElement(harness.dom.window.document, "#target");

  target.setAttribute("data-state", "first");
  target.setAttribute("data-state", "second");
  await flushMutations();
  assert.equal(harness.tracker.getEvents().length, 1);

  t.mock.timers.setTime(1_049);
  target.setAttribute("data-state", "third");
  await flushMutations();
  assert.equal(harness.tracker.getEvents().length, 1);

  t.mock.timers.setTime(1_050);
  target.setAttribute("data-state", "fourth");
  await flushMutations();
  assert.equal(harness.tracker.getEvents().length, 2);

  closeHarness(harness);
});

test("keeps the configured number of newest events", async () => {
  const harness = createHarness('<div id="target"></div>', {
    maxEvents: 3,
    dedupeWindowMs: 0,
  });
  const target = requireElement(harness.dom.window.document, "#target");

  for (let index = 0; index < 4; index += 1) {
    target.setAttribute(`data-${index}`, String(index));
  }
  await flushMutations();

  const events = harness.tracker.getEvents();
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) =>
      event.type === "attributes" ? event.attributeName : null,
    ),
    ["data-1", "data-2", "data-3"],
  );

  closeHarness(harness);
});

test("start, stop, restart, clear, and subscriptions are idempotent", async () => {
  const dom = new JSDOM('<!doctype html><body><div id="target"></div></body>');
  const tracker = createTracker({
    root: dom.window.document.body,
    dedupeWindowMs: 0,
  });
  const received: TrackerMutationEvent[] = [];
  const unsubscribe = tracker.subscribe((event) => received.push(event));
  const target = requireElement(dom.window.document, "#target");

  tracker.start();
  tracker.start();
  target.setAttribute("data-first", "tracked");
  await flushMutations();
  assert.equal(tracker.getEvents().length, 1);
  assert.equal(received.length, 1);

  tracker.stop();
  tracker.stop();
  target.setAttribute("data-stopped", "ignored");
  await flushMutations();
  assert.equal(tracker.getEvents().length, 1);

  tracker.start();
  target.setAttribute("data-restarted", "tracked");
  await flushMutations();
  assert.equal(tracker.getEvents().length, 2);

  tracker.clear();
  assert.equal(tracker.getEvents().length, 0);
  target.setAttribute("data-after-clear", "tracked");
  await flushMutations();
  assert.equal(tracker.getEvents()[0]?.sequence, 3);

  unsubscribe();
  unsubscribe();
  target.setAttribute("data-unsubscribed", "tracked");
  await flushMutations();
  assert.equal(received.length, 3);

  tracker.stop();
  dom.window.close();
});

test("isolates record and listener failures without stopping later events", async () => {
  const dom = new JSDOM(
    '<!doctype html><body><div id="unusual"></div><div id="later"></div></body>',
  );
  const errors: TrackerError[] = [];
  const tracker = createTracker({
    root: dom.window.document.body,
    dedupeWindowMs: 0,
    onError: (error) => errors.push(error),
  });
  const unusual = requireElement(dom.window.document, "#unusual");
  const later = requireElement(dom.window.document, "#later");
  const setUnusualAttribute = unusual.setAttribute.bind(unusual);
  tracker.subscribe(() => {
    throw new Error("listener failed");
  });
  tracker.start();

  unusual.getAttribute = () => {
    throw new Error("unusual target");
  };
  setUnusualAttribute("data-state", "changed");
  later.setAttribute("data-state", "changed");
  await flushMutations();

  assert.equal(tracker.getEvents().length, 1);
  assert.deepEqual(
    errors.map((error) => error.code),
    ["NORMALIZATION_FAILED", "LISTENER_FAILED"],
  );

  tracker.stop();
  dom.window.close();
});

test("validates options and fails explicitly without a DOM root", () => {
  assert.throws(() => createTracker({ maxEvents: 0 }), RangeError);
  assert.throws(() => createTracker({ dedupeWindowMs: -1 }), RangeError);
  assert.throws(() => createTracker({ root: {} as Node }), TypeError);
  assert.throws(
    () => createTracker().start(),
    (error: unknown) => {
      return error instanceof TrackerError && error.code === "MISSING_ROOT";
    },
  );
});

test("panel presentation highlights, logs, and cleans up deterministically", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const harness = createHarness('<div id="target"></div>');
  const { document } = harness.dom.window;
  harness.dom.window.setTimeout = ((callback: () => void, delay?: number) =>
    setTimeout(
      callback,
      delay,
    )) as unknown as typeof harness.dom.window.setTimeout;
  harness.dom.window.clearTimeout = ((timer: number) =>
    clearTimeout(
      timer as unknown as ReturnType<typeof setTimeout>,
    )) as typeof harness.dom.window.clearTimeout;
  const groups: string[] = [];
  const panel = createPanel(harness.tracker, {
    document,
    console: {
      groupCollapsed: (message?: unknown) => groups.push(String(message)),
      groupEnd() {},
      log() {},
    },
  });
  const target = requireElement(document, "#target");
  panel.mount();

  target.setAttribute("data-state", "changed");
  await flushMutations();
  assert.ok(target.classList.contains("mutation-tracker-highlight"));
  assert.equal(
    document.querySelectorAll("style[data-mutation-tracker]").length,
    1,
  );
  assert.deepEqual(groups, ["🔧 data-state → div#target"]);

  t.mock.timers.tick(3_000);
  assert.ok(target.classList.contains("mutation-tracker-highlight-fade-out"));
  t.mock.timers.tick(300);
  assert.equal(
    target.classList.contains("mutation-tracker-highlight-fade-out"),
    false,
  );

  panel.unmount();
  panel.unmount();
  assert.equal(
    document.querySelectorAll("style[data-mutation-tracker]").length,
    0,
  );
  closeHarness(harness);
});

test("standalone IIFE auto-starts and preserves the global snippet API", async () => {
  const source = await readFile(
    new URL("../dist/standalone.iife.js", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM('<!doctype html><body><div id="target"></div></body>', {
    runScripts: "outside-only",
  });
  const window = dom.window as unknown as StandaloneWindow;
  dom.window.setTimeout = (() => 0) as unknown as typeof dom.window.setTimeout;
  Object.assign(dom.window.console, {
    group() {},
    groupCollapsed() {},
    groupEnd() {},
    log() {},
  });

  dom.window.eval(source);
  assert.ok(window.DOMMutationTracker);
  assert.equal(
    dom.window.document.querySelectorAll("style[data-mutation-tracker]").length,
    1,
  );

  requireElement(dom.window.document, "#target").setAttribute(
    "data-state",
    "changed",
  );
  await flushMutations();
  assert.equal(window.DOMMutationTracker.getEvents().length, 1);
  assert.equal(window.getMutationLog().length, 1);

  window.clearMutationLog();
  assert.equal(window.DOMMutationTracker.getEvents().length, 0);
  window.stopMutationTracker();
  assert.equal(
    dom.window.document.querySelectorAll("style[data-mutation-tracker]").length,
    0,
  );
  window.startMutationTracker();
  window.stopMutationTracker();
  dom.window.close();
});
