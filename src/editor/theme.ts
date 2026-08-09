/** Editor colours, matched to the app chrome. Hand-rolled rather than pulling
 *  in a theme package for ~40 lines of CSS. */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const editorTheme = EditorView.theme(
  {
    "&": {
      color: "#d7dae0",
      backgroundColor: "#0e1013",
      height: "100%",
      fontSize: "13px",
    },
    ".cm-content": {
      caretColor: "#7aa2f7",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      padding: "12px 0",
    },
    ".cm-scroller": { overflow: "auto", lineHeight: "1.55" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#7aa2f7" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#23324d" },
    ".cm-gutters": {
      backgroundColor: "#0e1013",
      color: "#454b57",
      border: "none",
      borderRight: "1px solid #1b1f26",
    },
    ".cm-activeLine": { backgroundColor: "#14181e" },
    ".cm-activeLineGutter": { backgroundColor: "#14181e", color: "#7d838f" },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      borderBottom: "2px solid #e5484d",
      backgroundColor: "rgba(229, 72, 77, 0.12)",
    },
    ".cm-tooltip": {
      backgroundColor: "#161a20",
      border: "1px solid #2a2f38",
      borderRadius: "6px",
      color: "#d7dae0",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#23324d",
      color: "#e8eaee",
    },
    ".cm-completionDetail": { color: "#7d838f", fontStyle: "normal" },
    ".cm-panels": { backgroundColor: "#12151a", color: "#d7dae0" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: "#5a616d", fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "#c792ea" },
  { tag: [t.string, t.special(t.string)], color: "#9ece6a" },
  { tag: [t.number, t.bool, t.null], color: "#ff9e64" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7aa2f7" },
  { tag: [t.variableName, t.propertyName], color: "#d7dae0" },
  { tag: t.definition(t.variableName), color: "#e0af68" },
  { tag: [t.operator, t.punctuation, t.separator], color: "#89929f" },
  { tag: t.typeName, color: "#2ac3de" },
  { tag: t.invalid, color: "#e5484d" },
]);

export const theme = [editorTheme, syntaxHighlighting(highlight)];
