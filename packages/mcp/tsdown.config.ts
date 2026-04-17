import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "node",
  format: ["esm"],
  outDir: "dist",
  dts: false,
  deps: {
    alwaysBundle: ["@p0u4a/openchat-core"],
  },
});
