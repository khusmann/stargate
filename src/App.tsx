import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, type EditorMarker } from "./editor/Editor";
import { Preview } from "./preview/Preview";
import { Transport, type Readouts } from "./preview/Transport";
import { Player } from "./preview/player";
import { compileShow, type Show } from "./runtime/compile";
import { describeSeam, findLoopSeam } from "./runtime/loop";
import type { ShowError } from "./runtime/errors";
import { toShowError } from "./runtime/errors";
import { DEFAULT_EXAMPLE, type Example } from "./examples";
import { ExampleMenu } from "./examples/ExampleMenu";
import {
  clearFragment,
  incomingShow,
  initialState,
  save,
  shareUrl,
  writeFragment,
} from "./store/persist";
import { ExportCancelled, downloadBlob, exportShow, zipName } from "./export/exportShow";
import { buildPrompt } from "./api/prompt";
import { copyText } from "./util/clipboard";

const COMPILE_DEBOUNCE_MS = 250;
const PERSIST_DEBOUNCE_MS = 600;

type ExportState =
  | { status: "idle" }
  | { status: "running"; frame: number; frames: number };

export function App(): React.ReactElement {
  const [initial] = useState(() => initialState(DEFAULT_EXAMPLE.source));
  const [source, setSource] = useState(initial.source);
  // A show that arrived in a link is shown but not run until it is accepted.
  // Until then nothing about it is compiled, executed, or saved.
  const [pendingLink, setPendingLink] = useState(initial.fromLink);
  const [show, setShow] = useState<Show | null>(null);
  const [error, setError] = useState<ShowError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [status, setStatus] = useState<string | null>(null);
  const [seam, setSeam] = useState<string | null>(null);
  const [rotateHint, setRotateHint] = useState(true);

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
    if (pendingLink) return;
    const timer = setTimeout(() => {
      try {
        const compiled = compileShow(source);
        setShow(compiled);
        setError(null);
        player.setShow(compiled);
        player.refresh();
        // Two extra frames per edit, to catch the flaw you cannot see without
        // watching the exact moment the show wraps.
        const found = findLoopSeam(compiled);
        setSeam(found ? describeSeam(compiled, found) : null);
      } catch (err) {
        // Keep the last good show on screen; only the marker changes.
        setError(toShowError(err, "compile"));
      }
    }, COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, player, pendingLink]);

  // First successful compile starts playing.
  const started = useRef(false);
  useEffect(() => {
    if (show && !started.current) {
      started.current = true;
      player.setPlaying(true);
    }
  }, [show, player]);

  useEffect(() => {
    // Never persist an unaccepted link. Otherwise opening one hostile URL would
    // plant its payload in localStorage and run it on every later visit, with
    // no link in sight.
    if (pendingLink) return;
    const timer = setTimeout(() => {
      save(source);
      writeFragment(source);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, pendingLink]);

  // A link pasted into an already-open tab only changes the fragment, which is
  // a same-document navigation: nothing reloads, so watch for it. It gets the
  // same consent gate as one that was followed cold.
  useEffect(() => {
    const onHashChange = (): void => {
      const shared = incomingShow();
      if (shared === null) return;
      setSource(shared.source);
      setPendingLink(shared.fromLink);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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

      {/* An overlay, not part of any row: a transient message must never move
          the thing you were just looking at. */}
      {status && (
        <div className="status" role="status">
          {status}
        </div>
      )}

      {/* Only rendered at all in narrow portrait — see the media query. The
          wall is 16:1, so a phone held upright shows about half of it even at
          the lowest zoom. Rotating hides this without needing to dismiss it. */}
      {rotateHint && (
        <div className="rotate-hint">
          <span>The wall is long. Turn your phone sideways for a better view.</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setRotateHint(false)}
          >
            ✕
          </button>
        </div>
      )}

      {pendingLink && (
        <div className="consent" role="alert">
          <strong>This link contains someone else&rsquo;s show.</strong>
          <span>
            A show is JavaScript, and running it gives it the same access to this
            page as any other code here. It is in the editor below — read it
            first.
          </span>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setPendingLink(false);
              flash("Running the shared show");
            }}
          >
            Run it
          </button>
          <button
            type="button"
            onClick={() => {
              clearFragment();
              setSource(DEFAULT_EXAMPLE.source);
              setPendingLink(false);
            }}
          >
            Discard
          </button>
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
          {!error && seam && (
            <div className="notice" role="status">
              <strong>Loop</strong>
              <span className="msg">{seam}</span>
              <button
                type="button"
                onClick={async () => {
                  flash((await copyText(seam)) ? "Copied — paste it back" : "Copy failed");
                }}
                title="Copy this for the assistant that wrote the show"
              >
                Copy
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <strong>{error.phase === "compile" ? "Show error" : "Frame error"}</strong>
              {error.line !== undefined && <span className="dim"> line {error.line}</span>}
              <span className="msg">{error.message}</span>
              <button
                type="button"
                onClick={async () => {
                  const text =
                    `${error.message}` +
                    (error.line === undefined ? "" : ` (line ${error.line})`);
                  flash((await copyText(text)) ? "Copied — paste it back" : "Copy failed");
                }}
                title="Copy this for the assistant that wrote the show"
              >
                Copy
              </button>
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
