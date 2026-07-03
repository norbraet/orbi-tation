const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const trackerSource = fs.readFileSync(
  path.join(__dirname, "..", "dom-mutation-tracker.js"),
  "utf8",
);

function loadTracker(body) {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: "outside-only",
  });
  const collapsedGroups = [];
  const errors = [];

  Object.assign(dom.window.console, {
    group() {},
    groupCollapsed(message) {
      collapsedGroups.push(message);
    },
    groupEnd() {},
    log() {},
    warn() {},
    error(...args) {
      errors.push(args);
    },
  });
  dom.window.setTimeout = (callback) => {
    callback();
    return 0;
  };
  dom.window.eval(trackerSource);

  return { dom, collapsedGroups, errors };
}

function flushMutations() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("tracks HTML and SVG elements with safe, usable selectors", async () => {
  const { dom, collapsedGroups, errors } = loadTracker(`
    <div id="normal" class="card primary"></div>
    <svg id="icon:main" class="diagram state:on">
      <circle id="node.1" class="shape selected"></circle>
      <ellipse class=""></ellipse>
    </svg>
  `);
  const { document } = dom.window;
  const targets = [
    document.querySelector("#normal"),
    document.querySelector("svg"),
    document.querySelector("circle"),
    document.querySelector("ellipse"),
  ];

  targets.forEach((target) => target.setAttribute("data-state", "changed"));
  await flushMutations();

  const mutationLog = dom.window
    .getMutationLog()
    .filter((entry) => entry.attributeName === "data-state");

  assert.equal(mutationLog.length, targets.length);
  mutationLog.forEach((entry, index) => {
    assert.equal(document.querySelector(entry.selector), targets[index]);
  });
  assert.match(mutationLog[1].selector, /#icon\\:main\.diagram\.state\\:on/);
  assert.match(mutationLog[2].selector, /#node\\\.1\.shape\.selected/);
  assert.match(mutationLog[3].selector, /^ellipse:nth-child\(2\)$/);
  assert.ok(collapsedGroups.includes("🔧 data-state → div#normal.card"));
  assert.equal(errors.length, 0);

  dom.window.stopMutationTracker();
  dom.window.close();
});

test("continues processing a mutation batch after an unusual target fails", async () => {
  const { dom, errors } = loadTracker(`
    <div id="unusual"></div>
    <div id="later"></div>
  `);
  const { document } = dom.window;
  const unusual = document.querySelector("#unusual");
  const later = document.querySelector("#later");
  const setUnusualAttribute = unusual.setAttribute.bind(unusual);

  unusual.getAttribute = () => {
    throw new Error("unusual target");
  };
  setUnusualAttribute("data-state", "changed");
  later.setAttribute("data-state", "changed");
  await flushMutations();

  const mutationLog = dom.window
    .getMutationLog()
    .filter((entry) => entry.attributeName === "data-state");

  assert.equal(mutationLog.length, 1);
  assert.equal(mutationLog[0].target, later);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "Failed to process DOM mutation:");

  dom.window.stopMutationTracker();
  dom.window.close();
});
