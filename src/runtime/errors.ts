/** Errors from show code, carrying a line number wherever one can be recovered. */

export const SHOW_SOURCE_URL = "stargate-show.js";

export class ShowError extends Error {
  readonly line: number | undefined;
  readonly phase: "compile" | "render";

  constructor(
    message: string,
    opts: { line?: number | undefined; phase?: "compile" | "render" } = {},
  ) {
    super(message);
    this.name = "ShowError";
    this.line = opts.line;
    this.phase = opts.phase ?? "render";
  }
}

/**
 * `new Function` compiles its body inside a wrapper, so stack line numbers are
 * offset from the source the author wrote. The wrapper's shape is an engine
 * detail, so measure it once instead of hard-coding 2.
 */
let wrapperOffset: number | null = null;

export function newFunctionLineOffset(): number {
  if (wrapperOffset !== null) return wrapperOffset;
  wrapperOffset = 2;
  try {
    new Function("throw new Error('probe')\n//# sourceURL=stargate-probe.js")();
  } catch (err) {
    const m = /stargate-probe\.js:(\d+)/.exec(stackOf(err));
    if (m) wrapperOffset = Number(m[1]) - 1;
  }
  return wrapperOffset;
}

function stackOf(err: unknown): string {
  if (err instanceof Error && typeof err.stack === "string") return err.stack;
  return String(err);
}

/** Pull the show-source line out of a thrown error's stack, if it is in there. */
export function lineFromStack(err: unknown): number | undefined {
  const re = new RegExp(`${SHOW_SOURCE_URL}:(\\d+)(?::(\\d+))?`, "g");
  const stack = stackOf(err);
  let best: number | undefined;
  for (const m of stack.matchAll(re)) {
    const raw = Number(m[1]);
    if (!Number.isFinite(raw)) continue;
    const line = raw - newFunctionLineOffset();
    // The topmost show frame is the throwing one; keep it and ignore callers.
    if (line >= 1) {
      best = line;
      break;
    }
  }
  return best;
}

export function toShowError(
  err: unknown,
  phase: "compile" | "render",
  fallbackLine?: number,
): ShowError {
  if (err instanceof ShowError) return err;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const line = lineFromStack(err) ?? fallbackLine;
  return new ShowError(message, { line, phase });
}
