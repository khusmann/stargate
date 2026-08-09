/** Editor completions, driven off `stargate.d.ts` rather than a second list.
 *  The API is ~10 symbols; that is the size where a hand-written completion
 *  source with real doc strings beats running a language service in the tab. */

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { CONTEXT_SYMBOLS, GLOBAL_SYMBOLS, type ApiSymbol } from "../api/api";

function toCompletion(symbol: ApiSymbol): Completion {
  return {
    label: symbol.name,
    type: symbol.kind === "const" ? "variable" : "function",
    detail: symbol.signature,
    info: symbol.doc,
    boost: symbol.kind === "function" ? 1 : 0,
  };
}

const GLOBALS = GLOBAL_SYMBOLS.map(toCompletion);
const MEMBERS = CONTEXT_SYMBOLS.map(toCompletion);

function complete(context: CompletionContext): CompletionResult | null {
  const member = context.matchBefore(/ctx\.\w*/);
  if (member) {
    return { from: member.from + 4, options: MEMBERS, validFor: /^\w*$/ };
  }
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: GLOBALS, validFor: /^\w*$/ };
}

export const stargateCompletions = javascriptLanguage.data.of({ autocomplete: complete });
