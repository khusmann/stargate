/** CodeMirror 6, mounted on a ref. No React wrapper library — the editor owns
 *  its own state and React only pushes documents into it. */

import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { indentWithTab } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { stargateCompletions } from "./completions";
import { theme } from "./theme";

export interface EditorMarker {
  message: string;
  /** 1-based; when absent the marker goes on the first syntax error, or line 1. */
  line: number | undefined;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  marker: EditorMarker | null;
}

/** Where a broken parse first goes wrong. `new Function` reports syntax errors
 *  without a position in every engine, so the editor's own parser supplies it. */
function firstSyntaxErrorPos(view: EditorView): number | null {
  let found: number | null = null;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (found !== null) return false;
      if (node.type.isError) {
        found = node.from;
        return false;
      }
      return true;
    },
  });
  return found;
}

function diagnosticFor(view: EditorView, marker: EditorMarker): Diagnostic {
  const doc = view.state.doc;
  if (marker.line !== undefined && marker.line >= 1 && marker.line <= doc.lines) {
    const line = doc.line(marker.line);
    return {
      from: line.from,
      to: line.to,
      severity: "error",
      message: marker.message,
    };
  }
  const pos = firstSyntaxErrorPos(view);
  if (pos !== null) {
    const line = doc.lineAt(pos);
    return { from: line.from, to: line.to, severity: "error", message: marker.message };
  }
  const first = doc.line(1);
  return { from: first.from, to: first.to, severity: "error", message: marker.message };
}

export function Editor({ value, onChange, marker }: EditorProps): React.ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      basicSetup,
      lineNumbers(),
      javascript(),
      stargateCompletions,
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      theme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    ];
    const instance = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host.current,
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mounted once: `value` is pushed in by the effect below, not by remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External document changes only — loading an example, following a link.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const diagnostics = marker ? [diagnosticFor(instance, marker)] : [];
    instance.dispatch(setDiagnostics(instance.state, diagnostics));
  }, [marker]);

  return <div className="editor" ref={host} />;
}
