/** A very small scanner over show source, good for exactly one job: finding the
 *  top-level `export` declarations.
 *
 *  A show is an ES module by appearance, but it is evaluated with `new Function`
 *  rather than as a real module — a blob-URL module import does not survive a
 *  `file://` page, and the offline single-file build has to work from disk.
 *  So the `export` keywords are blanked out (replaced by spaces, which keeps
 *  every line *and column* number exact) and the declared names are collected
 *  and returned explicitly.
 *
 *  Collecting the names is what makes this a scanner rather than a regex: the
 *  alternative, `typeof name !== "undefined" ? name : undefined`, silently picks
 *  up `window.name` from a show that never declared one.
 */

export interface ExportBinding {
  /** Identifier as it appears in the source. */
  local: string;
  /** Name it is exported under — differs only for `export { a as b }`. */
  exported: string;
}

export interface ScanResult {
  /** Source with every top-level `export` keyword replaced by spaces. */
  code: string;
  bindings: ExportBinding[];
}

export class ScanError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

const ID_START = /[A-Za-z_$]/;
const ID_PART = /[A-Za-z0-9_$]/;

/** True if a `/` at this point starts a regex literal rather than a division. */
function regexAllowed(prev: string): boolean {
  return prev === "" || !/[A-Za-z0-9_$)\]]/.test(prev);
}

export function scanExports(source: string): ScanResult {
  const out = source.split("");
  const bindings: ExportBinding[] = [];
  let depth = 0;
  let line = 1;
  let prev = ""; // last significant (non-whitespace, non-comment) character

  let i = 0;
  const n = source.length;

  /** Advance past whitespace and comments, returning the new index. */
  function skipTrivia(j: number): number {
    for (;;) {
      const c = source[j];
      if (c === undefined) return j;
      if (c === "\n") {
        line++;
        j++;
      } else if (c === " " || c === "\t" || c === "\r") {
        j++;
      } else if (c === "/" && source[j + 1] === "/") {
        while (j < n && source[j] !== "\n") j++;
      } else if (c === "/" && source[j + 1] === "*") {
        j += 2;
        while (j < n && !(source[j] === "*" && source[j + 1] === "/")) {
          if (source[j] === "\n") line++;
          j++;
        }
        j += 2;
      } else {
        return j;
      }
    }
  }

  function readWord(j: number): { word: string; end: number } {
    let k = j;
    while (k < n && ID_PART.test(source[k]!)) k++;
    return { word: source.slice(j, k), end: k };
  }

  /** Names bound by a `const`/`let`/`var` declarator list starting at `j`. */
  function readDeclarators(j: number): { names: string[]; end: number } {
    const names: string[] = [];
    let k = j;
    let want = true; // next identifier at depth 0 is a binding name
    let d = 0;
    let last = "";
    for (; k < n; ) {
      const before = k;
      k = skipTrivia(k);
      if (k !== before && k < n) {
        // A newline at depth 0 ends the statement unless the line is obviously
        // continued (`x = 1,` / `x =`). Covers the common unterminated case.
        if (d === 0 && source.slice(before, k).includes("\n") && !/[,=+\-*/%&|^<>?:([{]/.test(last)) {
          break;
        }
      }
      const c = source[k];
      if (c === undefined) break;
      if (c === ";" && d === 0) {
        k++;
        break;
      }
      if (c === "," && d === 0) {
        want = true;
        last = c;
        k++;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") d++;
      else if (c === ")" || c === "]" || c === "}") {
        if (d === 0) break;
        d--;
      }
      if (want && d === 0 && ID_START.test(c)) {
        const { word, end } = readWord(k);
        names.push(word);
        want = false;
        last = word.slice(-1);
        k = end;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        k = skipString(k);
        last = c;
        continue;
      }
      last = c;
      k++;
    }
    return { names, end: k };
  }

  /** Index just past the string/template starting at `j`. */
  function skipString(j: number): number {
    const quote = source[j]!;
    let k = j + 1;
    while (k < n) {
      const c = source[k]!;
      if (c === "\\") {
        k += 2;
        continue;
      }
      if (c === "\n") line++;
      if (c === quote) return k + 1;
      if (quote === "`" && c === "$" && source[k + 1] === "{") {
        // Template substitution: brace-match through it.
        let d = 1;
        k += 2;
        while (k < n && d > 0) {
          const q = source[k]!;
          if (q === "{") d++;
          else if (q === "}") d--;
          else if (q === "\n") line++;
          else if (q === '"' || q === "'" || q === "`") {
            k = skipString(k);
            continue;
          }
          k++;
        }
        continue;
      }
      k++;
    }
    return k;
  }

  while (i < n) {
    const before = i;
    i = skipTrivia(i);
    if (i !== before) continue;
    const c = source[i]!;

    if (c === '"' || c === "'" || c === "`") {
      i = skipString(i);
      prev = c;
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      // Regex literal — consume it so `/a\/*b/` is not mistaken for a comment.
      let k = i + 1;
      let inClass = false;
      while (k < n) {
        const q = source[k]!;
        if (q === "\\") {
          k += 2;
          continue;
        }
        if (q === "[") inClass = true;
        else if (q === "]") inClass = false;
        else if (q === "/" && !inClass) break;
        else if (q === "\n") break;
        k++;
      }
      i = k + 1;
      prev = "/";
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth = Math.max(0, depth - 1);

    if (depth === 0 && c === "e" && ID_START.test(c) && !ID_PART.test(prev || " ")) {
      const { word, end } = readWord(i);
      if (word === "export") {
        const kwLine = line;
        for (let k = i; k < end; k++) out[k] = " ";
        let j = skipTrivia(end);
        const next = readWord(j);

        if (next.word === "default" || source[j] === "*") {
          throw new ScanError(
            "`export default` is not supported — export named values: " +
              "`export const name = ...`, `export function pixel(x, y, t) { ... }`.",
            kwLine,
          );
        }
        if (next.word === "const" || next.word === "let" || next.word === "var") {
          const { names } = readDeclarators(next.end);
          for (const name of names) bindings.push({ local: name, exported: name });
        } else if (next.word === "function" || next.word === "class") {
          let k = skipTrivia(next.end);
          if (source[k] === "*") k = skipTrivia(k + 1);
          const id = readWord(k);
          if (id.word) bindings.push({ local: id.word, exported: id.word });
        } else if (next.word === "async") {
          const k = skipTrivia(next.end);
          const fn = readWord(k);
          if (fn.word === "function") {
            let m = skipTrivia(fn.end);
            if (source[m] === "*") m = skipTrivia(m + 1);
            const id = readWord(m);
            if (id.word) bindings.push({ local: id.word, exported: id.word });
          }
        } else if (source[j] === "{") {
          // export { a, b as c }
          const close = source.indexOf("}", j);
          const body = source.slice(j + 1, close < 0 ? n : close);
          for (const part of body.split(",")) {
            const bits = part.trim().split(/\s+as\s+/);
            const local = (bits[0] ?? "").trim();
            const exported = (bits[1] ?? local).trim();
            if (local) bindings.push({ local, exported });
          }
          j = (close < 0 ? n : close) + 1;
        }
        i = end;
        prev = "t";
        continue;
      }
      i = end;
      prev = word.slice(-1);
      continue;
    }

    if (ID_START.test(c)) {
      const { word, end } = readWord(i);
      i = end;
      prev = word.slice(-1);
      continue;
    }

    prev = c;
    i++;
  }

  return { code: out.join(""), bindings };
}

/** `import` cannot work inside `new Function`, so say why rather than let V8 do it. */
export function rejectImports(source: string): void {
  const m = /^[ \t]*import[ \t\n(]/m.exec(source);
  if (m) {
    const line = source.slice(0, m.index).split("\n").length;
    throw new ScanError(
      "A show is one self-contained file — `import` is not available. " +
        "`rgb` and `hsl` are already globals.",
      line,
    );
  }
}
