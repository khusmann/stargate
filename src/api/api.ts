/** `stargate.d.ts` is the single source of truth for three consumers: the
 *  editor's completions, the "Copy AI prompt" payload, and the human docs.
 *  This reads it rather than duplicating the symbol list anywhere. */

import dts from "./stargate.d.ts?raw";

export const API_DTS: string = dts.trim();

export interface ApiSymbol {
  name: string;
  kind: "const" | "function" | "member";
  /** One-line signature, e.g. `hsl(h: number, s: number, l: number): number`. */
  signature: string;
  doc: string;
}

function cleanDoc(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const TOP_LEVEL =
  /\/\*\*([\s\S]*?)\*\/\s*(?:export\s+)?(?:declare\s+)?(const|function)\s+([A-Za-z_$][\w$]*)([^;]*);/g;

const MEMBER =
  /\/\*\*([\s\S]*?)\*\/\s*([A-Za-z_$][\w$]*)\s*(\([^)]*\)\s*:\s*[^;]+|:\s*[^;]+);/g;

function parse(source: string): ApiSymbol[] {
  const symbols: ApiSymbol[] = [];

  const interfaceStart = source.indexOf("interface ShowContext");
  const top = interfaceStart < 0 ? source : source.slice(0, interfaceStart);

  for (const m of top.matchAll(TOP_LEVEL)) {
    const kind = m[2] === "function" ? "function" : "const";
    const name = m[3] ?? "";
    symbols.push({
      name,
      kind,
      signature: `${name}${(m[4] ?? "").replace(/\s+/g, " ").trimEnd()}`,
      doc: cleanDoc(m[1] ?? ""),
    });
  }

  if (interfaceStart >= 0) {
    const body = source.slice(source.indexOf("{", interfaceStart) + 1);
    for (const m of body.matchAll(MEMBER)) {
      const name = m[2] ?? "";
      symbols.push({
        name,
        kind: "member",
        signature: `${name}${(m[3] ?? "").replace(/\s+/g, " ")}`,
        doc: cleanDoc(m[1] ?? ""),
      });
    }
  }

  return symbols;
}

export const API_SYMBOLS: ApiSymbol[] = parse(API_DTS);

/** Symbols a show can call or define at top level. */
export const GLOBAL_SYMBOLS: ApiSymbol[] = API_SYMBOLS.filter((s) => s.kind !== "member");

/** Members of the `ctx` passed to `draw`. */
export const CONTEXT_SYMBOLS: ApiSymbol[] = API_SYMBOLS.filter((s) => s.kind === "member");
