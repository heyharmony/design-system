import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // Declarations come from `tsc` (see `build:ts`). tsup's declaration bundler
  // marks every module whose path contains `node_modules` as external, so when
  // this package builds itself inside one (a git dependency's `prepare`, e.g.
  // from a pnpm store under node_modules) it dropped src/generated/tokens and
  // shipped an index.d.ts re-exporting from a file that does not exist.
  dts: false,
  clean: false,
  outDir: "dist",
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
