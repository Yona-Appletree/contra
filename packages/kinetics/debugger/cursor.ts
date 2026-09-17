/**
 * The one bar, and the only thing on the page that knows what time it is.
 *
 * Every pane subscribes and redraws; nothing else owns a beat. Playing is a
 * `requestAnimationFrame` loop that advances by wall-clock milliseconds at the
 * run's tempo, so a slow frame loses time rather than beats.
 */
export function cursor(): Cursor {
  const listeners = new Set<(beat: number, playing: boolean) => void>();
  let beat = 0;
  let endBeat = 0;
  let bpm = 112;
  let playing = false;
  let last = 0;
  let frame = 0;

  const announce = (): void => {
    for (const f of listeners) f(beat, playing);
  };
  const clamp = (b: number): number => Math.min(Math.max(b, 0), endBeat);

  const step = (now: number): void => {
    if (!playing) return;
    const elapsed = (now - last) / 1000;
    last = now;
    beat = beat + (elapsed * bpm) / 60;
    if (beat >= endBeat) {
      beat = endBeat;
      playing = false;
    }
    announce();
    if (playing) frame = requestAnimationFrame(step);
  };

  return {
    beat: () => beat,
    endBeat: () => endBeat,
    playing: () => playing,
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
    play() {
      if (playing || endBeat <= 0) return;
      if (beat >= endBeat) beat = 0;
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

export interface Cursor {
  beat(): number;
  endBeat(): number;
  playing(): boolean;
  set(beat: number): void;
  setEnd(endBeat: number): void;
  setBpm(bpm: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  subscribe(f: (beat: number, playing: boolean) => void): void;
}
