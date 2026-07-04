import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    panel: "src/panel/index.ts",
  },
  format: ["esm", "cjs"],
  target: "es2022",
  platform: "neutral",
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
