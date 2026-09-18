/**
 * The one bar, and the only thing on the page that knows what time it is.
 *
 * Every pane subscribes and redraws; nothing else owns a beat. Playing is a
 * `requestAnimationFrame` loop that advances by wall-clock milliseconds at the
 * run's tempo, so a slow frame loses time rather than beats. A review
 * instrument loops: at the end of the run the bar goes round to the start, and
 * with a **loop range** set (the running call, M9) it goes round inside that.
 */
export function cursor(): Cursor {
  const listeners = new Set<(beat: number, playing: boolean) => void>();
  let beat = 0;
  let endBeat = 0;
  let bpm = 112;
  let playing = false;
  let last = 0;
  let frame = 0;
  let loop: LoopRange | undefined;

  const announce = (): void => {
    for (const f of listeners) f(beat, playing);
  };
  /** Into the loop when there is one, else onto the run. */
  const clamp = (b: number): number => {
    if (loop !== undefined) {
      const [start, end] = loop;
      const length = end - start;
      if (length <= 0) return start;
      return start + ((((b - start) % length) + length) % length);
    }
    return Math.min(Math.max(b, 0), endBeat);
  };

  const step = (now: number): void => {
    if (!playing) return;
    const elapsed = (now - last) / 1000;
    last = now;
    beat = beat + (elapsed * bpm) / 60;
    if (loop !== undefined) beat = clamp(beat);
    else if (beat >= endBeat) beat = endBeat > 0 ? beat - endBeat : 0;
    announce();
    if (playing) frame = requestAnimationFrame(step);
  };

  return {
    beat: () => beat,
    endBeat: () => endBeat,
    playing: () => playing,
    loop: () => loop,
    set(next) {
      beat = clamp(next);
      announce();
    },
    setEnd(next) {
      endBeat = Math.max(next, 0);
      beat = clamp(beat);
      announce();
    },
    setBpm(next) {
      bpm = next;
    },
    setLoop(range) {
      loop = range;
      beat = clamp(beat);
      announce();
    },
    play() {
      if (playing || endBeat <= 0) return;
      playing = true;
      last = performance.now();
      frame = requestAnimationFrame(step);
      announce();
    },
    pause() {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(frame);
      announce();
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    subscribe(f) {
      listeners.add(f);
    },
  };
}

/** `[start, end)` in beats: the bar stays inside it while it is set. */
export type LoopRange = readonly [number, number];

export interface Cursor {
  beat(): number;
  endBeat(): number;
  playing(): boolean;
  loop(): LoopRange | undefined;
  set(beat: number): void;
  setEnd(endBeat: number): void;
  setBpm(bpm: number): void;
  setLoop(range: LoopRange | undefined): void;
  play(): void;
  pause(): void;
  toggle(): void;
  subscribe(f: (beat: number, playing: boolean) => void): void;
}
