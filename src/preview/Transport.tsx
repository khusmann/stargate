/** Transport controls. The scrubber and the frame counter are written straight
 *  to the DOM by the render loop, so they update every frame without a single
 *  React render. */

import type { Show } from "../runtime/compile";
import type { Player } from "./player";

export interface Readouts {
  clock: HTMLSpanElement | null;
  scrub: HTMLInputElement | null;
}

interface TransportProps {
  player: Player;
  show: Show | null;
  playing: boolean;
  looping: boolean;
  onLoopingChange: (looping: boolean) => void;
  readouts: React.RefObject<Readouts>;
}

export function Transport({
  player,
  show,
  playing,
  looping,
  onLoopingChange,
  readouts,
}: TransportProps): React.ReactElement {
  const frames = show?.frames ?? 1;

  const step = (delta: number): void => {
    player.setPlaying(false);
    player.seek(player.currentFrame() + delta);
  };

  return (
    <div className="transport">
      <button type="button" onClick={() => player.seek(0)} title="Back to start">
        ⏮
      </button>
      <button type="button" onClick={() => step(-1)} title="Previous frame">
        ◀
      </button>
      <button
        type="button"
        className="primary"
        onClick={() => player.setPlaying(!playing)}
        disabled={!show}
      >
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <button type="button" onClick={() => step(1)} title="Next frame">
        ▶
      </button>
      <button
        type="button"
        aria-pressed={looping}
        onClick={() => onLoopingChange(!looping)}
        title="Loop"
      >
        ⟲ Loop
      </button>

      <input
        className="scrub"
        type="range"
        min={0}
        max={frames - 1}
        step={1}
        defaultValue={0}
        disabled={!show}
        aria-label="Scrub"
        ref={(el) => {
          readouts.current.scrub = el;
        }}
        onInput={(event) => {
          player.setPlaying(false);
          player.seek(Number(event.currentTarget.value));
        }}
      />

      <span
        className="counter"
        ref={(el) => {
          readouts.current.clock = el;
        }}
      >
        1 / {frames}
      </span>
    </div>
  );
}
