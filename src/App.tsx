import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, type EditorMarker } from "./editor/Editor";
import { Preview } from "./preview/Preview";
import { Transport, type Readouts } from "./preview/Transport";
import { Player } from "./preview/player";
import { compileShow, type Show } from "./runtime/compile";
import type { ShowError } from "./runtime/errors";
import { toShowError } from "./runtime/errors";
import { DEFAULT_EXAMPLE, type Example } from "./examples";
import { ExampleMenu } from "./examples/ExampleMenu";
import { initialScript, save, shareUrl, writeFragment } from "./store/persist";
import { ExportCancelled, downloadBlob, exportShow, zipName } from "./export/exportShow";
import { buildPrompt } from "./api/prompt";
import { copyText } from "./util/clipboard";

const COMPILE_DEBOUNCE_MS = 250;
const PERSIST_DEBOUNCE_MS = 600;

type ExportState =
  | { status: "idle" }
  | { status: "running"; frame: number; frames: number };

export function App(): React.ReactElement {
  const [source, setSource] = useState(() => initialScript(DEFAULT_EXAMPLE.source));
  const [show, setShow] = useState<Show | null>(null);
  const [error, setError] = useState<ShowError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [status, setStatus] = useState<string | null>(null);

  const readouts = useRef<Readouts>({ clock: null, scrub: null });
  const abort = useRef<AbortController | null>(null);

  // A ref, not useMemo: React is free to discard a memo, and a second Player
  // would re-attach the canvases — which resets them, wiping the last good
  // frame exactly when an error means it is the only thing left to look at.
  const playerRef = useRef<Player | null>(null);
  if (playerRef.current === null) {
    playerRef.current = new Player({
      onFrame: (frame, frames) => {
        // Direct DOM writes: at 30 fps this is a re-render every 33 ms otherwise.
        const { clock, scrub } = readouts.current;
        if (clock) clock.textContent = `${frame + 1} / ${frames}`;
        if (scrub && document.activeElement !== scrub) scrub.value = String(frame);
      },
      onPlayingChange: setPlaying,
      onError: setError,
    });
  }
  const player = playerRef.current;

  useEffect(() => {
    player.start();
    return () => player.dispose();
  }, [player]);

  useEffect(() => {
    player.setLooping(looping);
  }, [player, looping]);

  // Hot reload: compile shortly after typing stops, keeping the playhead.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const compiled = compileShow(source);
        setShow(compiled);
        setError(null);
        player.setShow(compiled);
        player.refresh();
      } catch (err) {
        // Keep the last good show on screen; only the marker changes.
        setError(toShowError(err, "compile"));
      }
    }, COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, player]);

  // First successful compile starts playing.
  const started = useRef(false);
  useEffect(() => {
    if (show && !started.current) {
      started.current = true;
      player.setPlaying(true);
    }
  }, [show, player]);

  useEffect(() => {
    const timer = setTimeout(() => {
      save(source);
      writeFragment(source);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

  const flash = useCallback((message: string) => {
    setStatus(message);
    setTimeout(() => setStatus((current) => (current === message ? null : current)), 2500);
  }, []);

  const marker: EditorMarker | null = error
    ? { message: error.message, line: error.line }
    : null;

  const runExport = async (): Promise<void> => {
    if (!show || exportState.status === "running") return;
    player.setPlaying(false);
    const controller = new AbortController();
    abort.current = controller;
    setExportState({ status: "running", frame: 0, frames: show.frames });
    try {
      const blob = await exportShow(show, {
        signal: controller.signal,
        onProgress: ({ frame, frames }) =>
          setExportState({ status: "running", frame, frames }),
      });
      downloadBlob(blob, zipName(show.name));
      flash(`Exported ${show.frames} frames · ${(blob.size / 1e6).toFixed(1)} MB`);
    } catch (err) {
      if (err instanceof ExportCancelled) flash("Export cancelled");
      else setError(toShowError(err, "render"));
    } finally {
      abort.current = null;
      setExportState({ status: "idle" });
    }
  };

  // Replacing the document is one CodeMirror transaction, so undo puts the
  // previous work straight back. That is the whole safety mechanism: no
  // confirm dialog, no blocked action, just a reversible one.
  const loadExample = (example: Example): void => {
    setSource(example.source);
    flash(`Loaded ${example.name} — undo to go back`);
  };

  const exportLabel =
    exportState.status === "running"
      ? `Exporting ${Math.round((exportState.frame / exportState.frames) * 100)}%`
      : "Export frames";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Stargate</h1>
          <span className="dim topnote">192 × 24 — two strips, opposite walls</span>
        </div>

        <div className="topbar-centre">
          <ExampleMenu onPick={loadExample} />
        </div>

        <div className="topbar-right">
          {status && <span className="status">{status}</span>}
          <button
            type="button"
            onClick={async () => {
              flash((await copyText(buildPrompt())) ? "AI prompt copied" : "Copy failed");
            }}
            title="Paste into any assistant to get a show back"
          >
            Copy AI prompt
          </button>
          <button
            type="button"
            onClick={async () => {
              flash((await copyText(shareUrl(source))) ? "Link copied" : "Copy failed");
            }}
            title="A link that carries the whole show"
          >
            Copy link
          </button>
          {exportState.status === "running" ? (
            <button type="button" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            onClick={() => void runExport()}
            disabled={!show || exportState.status === "running"}
          >
            {exportLabel}
          </button>
        </div>
      </header>

      {exportState.status === "running" && (
        <div className="progress">
          <div
            className="progress-bar"
            style={{ width: `${(exportState.frame / exportState.frames) * 100}%` }}
          />
        </div>
      )}

      <Preview player={player} />

      <Transport
        player={player}
        show={show}
        playing={playing}
        looping={looping}
        onLoopingChange={setLooping}
        readouts={readouts}
      />

      <div className="lower">
        <div className="editor-pane">
          <Editor value={source} onChange={setSource} marker={marker} />
          {error && (
            <div className="error" role="alert">
              <strong>{error.phase === "compile" ? "Show error" : "Frame error"}</strong>
              {error.line !== undefined && <span className="dim"> line {error.line}</span>}
              <span className="msg">{error.message}</span>
            </div>
          )}
        </div>

        <aside className="side">
          <h2>The wall</h2>
          <p className="dim">
            Rows 0–11 and rows 12–23 are on opposite sides of a corridor. A shape across
            the middle is cut in half and lands on two different walls — write two shows
            that share a timeline. <code>y % 12</code> makes them identical,{" "}
            <code>y &lt; 12</code> tells them apart.
          </p>
        </aside>
      </div>
    </div>
  );
}
