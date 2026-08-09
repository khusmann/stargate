/** Turn show source into a runnable Show. */

import { rgb, hsl } from "./color";
import { rejectImports, ScanError, scanExports } from "./parse";
import { SHOW_SOURCE_URL, ShowError, toShowError } from "./errors";
import type { ShowContext } from "./context";

export interface Show {
  readonly name: string;
  readonly fps: number;
  readonly seconds: number;
  /** Total frames — `fps * seconds`, rounded, at least 1. */
  readonly frames: number;
  readonly pixel: ((x: number, y: number, t: number) => number) | undefined;
  readonly draw: ((ctx: ShowContext, t: number) => void) | undefined;
}

const MAX_FRAMES = 36_000; // 20 minutes at 30 fps — far past any real show.

type Exports = Record<string, unknown>;

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Compile and evaluate show source. Top-level show code runs here, so this
 * throws ShowError for syntax errors, bad metadata, and anything the module
 * body throws on the way up.
 */
export function compileShow(source: string): Show {
  rejectImports(source);

  let code: string;
  let bindings: ReturnType<typeof scanExports>["bindings"];
  try {
    const scanned = scanExports(source);
    code = scanned.code;
    bindings = scanned.bindings;
  } catch (err) {
    if (err instanceof ScanError) {
      throw new ShowError(err.message, { line: err.line, phase: "compile" });
    }
    throw toShowError(err, "compile");
  }

  if (bindings.length === 0) {
    throw new ShowError(
      "This show exports nothing. Define `export function pixel(x, y, t)` " +
        "or `export function draw(ctx, t)`.",
      { phase: "compile" },
    );
  }

  // The collector is appended after the author's code, so it cannot shift any
  // line number. Only names the scanner actually saw are collected.
  const collector = bindings
    .map((b) => `${JSON.stringify(b.exported)}: ${b.local}`)
    .join(", ");
  const body = `${code}\n;return { ${collector} };\n//# sourceURL=${SHOW_SOURCE_URL}`;

  let factory: (r: typeof rgb, h: typeof hsl) => Exports;
  try {
    factory = new Function("rgb", "hsl", body) as typeof factory;
  } catch (err) {
    // A SyntaxError out of `new Function` carries no usable position in any
    // engine; the editor's own parser supplies the marker instead.
    throw toShowError(err, "compile");
  }

  let exports: Exports;
  try {
    exports = factory(rgb, hsl);
  } catch (err) {
    throw toShowError(err, "compile");
  }

  const pixel = exports["pixel"];
  const draw = exports["draw"];
  if (typeof pixel !== "function" && typeof draw !== "function") {
    throw new ShowError(
      "A show needs `export function pixel(x, y, t)` or `export function draw(ctx, t)` " +
        "— it can define both.",
      { phase: "compile" },
    );
  }

  const fps = num(exports["fps"], 30);
  const seconds = num(exports["seconds"], 10);
  if (fps <= 0) throw new ShowError("`fps` must be greater than 0.", { phase: "compile" });
  if (seconds <= 0)
    throw new ShowError("`seconds` must be greater than 0.", { phase: "compile" });

  const frames = Math.max(1, Math.round(fps * seconds));
  if (frames > MAX_FRAMES) {
    throw new ShowError(
      `${frames} frames is more than this tool will render (${MAX_FRAMES}). ` +
        "Reduce `seconds` or `fps`.",
      { phase: "compile" },
    );
  }

  const rawName = exports["name"];
  const name =
    typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : "Untitled";

  return {
    name,
    fps,
    seconds,
    frames,
    pixel: typeof pixel === "function" ? (pixel as Show["pixel"]) : undefined,
    draw: typeof draw === "function" ? (draw as Show["draw"]) : undefined,
  };
}
