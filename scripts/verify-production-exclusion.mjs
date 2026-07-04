import assert from "node:assert/strict";
import path from "node:path";
import { build } from "tsdown";

const entry = path.resolve("test/fixtures/production-entry.mjs");

async function createBundle(isDevelopment) {
  const bundles = await build({
    config: false,
    entry: { app: entry },
    format: "esm",
    platform: "browser",
    target: "es2022",
    define: { "import.meta.env.DEV": String(isDevelopment) },
    deps: {
      alwaysBundle: [/^dom-mutation-tracker(?:\/panel)?$/],
      onlyBundle: false,
    },
    clean: false,
    dts: false,
    hash: false,
    logLevel: "silent",
    minify: "dce-only",
    report: false,
    sourcemap: false,
    write: false,
  });

  try {
    return bundles
      .flatMap((bundle) => bundle.chunks)
      .reduce(
        (output, chunk) => output + (chunk.type === "chunk" ? chunk.code : ""),
        "",
      );
  } finally {
    await Promise.all(bundles.map((bundle) => bundle[Symbol.asyncDispose]()));
  }
}

const developmentBundle = await createBundle(true);
const productionBundle = await createBundle(false);

assert.match(developmentBundle, /MutationObserver/);
assert.match(developmentBundle, /mutation-tracker-highlight/);
assert.match(productionBundle, /host-application/);
assert.doesNotMatch(productionBundle, /MutationObserver/);
assert.doesNotMatch(productionBundle, /mutation-tracker-highlight/);
assert.doesNotMatch(productionBundle, /dom-mutation-tracker/);

console.log(
  `Production guard removed tracker code (${developmentBundle.length} bytes development; ${productionBundle.length} bytes production).`,
);
