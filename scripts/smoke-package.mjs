import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "orbi-tation-"));

try {
  const packOutput = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      temporaryDirectory,
    ],
    { encoding: "utf8" },
  );
  const [packResult] = JSON.parse(packOutput);
  assert.ok(packResult, "npm pack did not return package metadata");

  const packagedFiles = new Set(packResult.files.map((file) => file.path));
  const requiredFiles = [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/panel.js",
    "dist/panel.cjs",
    "dist/panel.d.ts",
    "package.json",
    "src/index.ts",
  ];

  for (const file of requiredFiles) {
    assert.ok(packagedFiles.has(file), `Packed package is missing ${file}`);
  }
  assert.equal(
    Array.from(packagedFiles).some((file) => file.startsWith("test/")),
    false,
  );

  const consumerDirectory = path.join(temporaryDirectory, "consumer");
  await writeFile(
    path.join(temporaryDirectory, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  const tarball = path.join(temporaryDirectory, packResult.filename);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: temporaryDirectory, stdio: "pipe" },
  );

  await writeFile(
    `${consumerDirectory}.mjs`,
    `
      import { createTracker } from "orbi-tation";
      import { createPanel } from "orbi-tation/panel";
      if (typeof createTracker !== "function" || typeof createPanel !== "function") process.exit(1);
      createTracker();
    `,
  );
  await writeFile(
    `${consumerDirectory}.cjs`,
    `
      const { createTracker } = require("orbi-tation");
      const { createPanel } = require("orbi-tation/panel");
      if (typeof createTracker !== "function" || typeof createPanel !== "function") process.exit(1);
      createTracker();
    `,
  );
  await writeFile(
    `${consumerDirectory}.mts`,
    `
      import { createTracker, type TrackerMutationEvent } from "orbi-tation";
      import { createPanel } from "orbi-tation/panel";
      const tracker = createTracker();
      const listener = (event: TrackerMutationEvent): void => void event.type;
      tracker.subscribe(listener);
      createPanel(tracker);
    `,
  );
  await writeFile(
    `${consumerDirectory}.cts`,
    `
      import trackerPackage = require("orbi-tation");
      import panelPackage = require("orbi-tation/panel");
      const tracker: trackerPackage.Tracker = trackerPackage.createTracker();
      panelPackage.createPanel(tracker);
    `,
  );
  await writeFile(
    `${consumerDirectory}.side-effects.mjs`,
    `
      let observerCount = 0;
      globalThis.MutationObserver = class {
        constructor() {
          observerCount += 1;
        }
      };
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        get() {
          throw new Error("Package import accessed document");
        },
      });

      await import("orbi-tation");
      await import("orbi-tation/panel");

      if (observerCount !== 0) throw new Error("Package import started an observer");
      if (globalThis.DOMMutationTracker !== undefined) throw new Error("Package import exposed a browser global");
      if (globalThis.domMutationTracker !== undefined) throw new Error("Package import exposed a browser global");
    `,
  );

  execFileSync(process.execPath, [`${consumerDirectory}.mjs`], {
    cwd: temporaryDirectory,
    stdio: "pipe",
  });
  execFileSync(process.execPath, [`${consumerDirectory}.cjs`], {
    cwd: temporaryDirectory,
    stdio: "pipe",
  });
  execFileSync(process.execPath, [`${consumerDirectory}.side-effects.mjs`], {
    cwd: temporaryDirectory,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    [
      path.resolve("node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      `${consumerDirectory}.mts`,
      `${consumerDirectory}.cts`,
    ],
    { cwd: temporaryDirectory, stdio: "pipe" },
  );

  const installedPackage = JSON.parse(
    await readFile(
      path.join(temporaryDirectory, "node_modules/orbi-tation/package.json"),
      "utf8",
    ),
  );
  assert.equal(installedPackage.sideEffects, false);
  assert.deepEqual(Object.keys(installedPackage.exports).sort(), [
    ".",
    "./package.json",
    "./panel",
  ]);
  assert.deepEqual(installedPackage.dependencies ?? {}, {});
  console.log(
    `Packed ${packagedFiles.size} files; entries are side-effect-free and ESM/CJS runtime and type smoke tests passed.`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
