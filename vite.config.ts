import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { viteSingleFile } from "vite-plugin-singlefile";

// A show is arbitrary JavaScript executed in this page's origin, so the origin
// is worth locking down. `connect-src 'none'` is the important one: the app
// makes no network requests after load, so denying them outright removes
// exfiltration as an option for anything that does run here.
//
// `unsafe-eval` cannot go — `new Function` *is* the show runtime — so this is
// defence in depth, not a sandbox. Build only: Vite's dev server needs a
// websocket for hot reload, which `connect-src 'none'` would kill.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // No frame-ancestors: it is ignored in a meta tag and only works as a real
  // response header, which GitHub Pages cannot set.
].join("; ");

const contentSecurityPolicy: Plugin = {
  name: "stargate-csp",
  apply: "build",
  transformIndexHtml() {
    return [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
    ];
  },
};

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
      contentSecurityPolicy,
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
