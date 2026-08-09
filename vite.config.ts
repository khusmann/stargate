import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two builds from one source:
//   `vite build`               → dist/,        served from GitHub Pages at /stargate/
//   `vite build --mode single` → dist-single/, one self-contained file, opened from disk
//
// A project Pages site lives under /<repo>/, so `base` must match the repo name or
// every asset 404s. The single-file build has no server at all, hence "./".
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: single ? "./" : "/stargate/",
    plugins: [
      react(),
      checker({ typescript: true }),
      ...(single ? [viteSingleFile()] : []),
    ],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      target: "es2022",
      // One big chunk is the point here — CodeMirror plus React, no splitting.
      chunkSizeWarningLimit: 1200,
      // vite-plugin-singlefile needs everything in one chunk and every asset inlined.
      ...(single
        ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false }
        : {}),
    },
  };
});
