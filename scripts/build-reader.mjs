import { build } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  configFile: false,
  root,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: "public/generated",
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: "src/reader.ts",
      name: "FolioReader",
      cssFileName: "reader",
      formats: ["iife"],
      fileName: () => "reader.js",
    },
    minify: true,
  },
});
