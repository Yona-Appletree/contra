import type { Beat } from "@caller/core";
import type { Dance } from "@caller/choreo";
import type { DanceMove, DanceMoves } from "./danceMoves.js";
import { danceMoves, moveAt } from "./danceMoves.js";
import type { DemoProgram } from "./program.js";
import { CYCLE_BEATS, ITEM_BEATS, TIMES_THROUGH, danceStartBeat } from "./program.js";

/**
 * |◀'s own rule: pressed again within this many beats of the move (or dance)
 * you just landed on, it goes to the *previous* one instead of restarting the
 * one you are on — "the CD-player rule" (Yona, round 2: "the |◀ rule is
 * restart, or previous when within two beats — no timed double-press").
 */
export const PREV_THRESHOLD_BEATS = 2;

/** Where a transport press lands, and what to call it. */
export interface Target {
  beat: Beat;
  /**
   * What the press did, in words — for a future readout line (Q5's future
   * work) and, today, for a failing test to say what it pressed rather than
   * only the beat it landed on.
   */
  label: string;
}

/** The dance an unwrapped item index names — `program.dances`, wrapped at its own length. */
export function danceAtItem(program: DemoProgram, item: number): Dance {
  const n = program.dances.length;
  return program.dances[((item % n) + n) % n]!;
}

const movesCache = new WeakMap<Dance, DanceMoves>();

/**
 * `danceMoves` for the dance at this item, cached per dance object.
 *
 * Keyed on the `Dance` itself, not on `(program, item)`: every demo dance is
 * one module-level object shared by every programme that dances it
 * (`DEMO_DANCES`/`ALL_DANCES` in `@caller/contra`), so a `WeakMap` on the
 * dance pays for its registry lookup and call resolution once no matter how
 * many items, programmes or transport presses ask for the same dance — and
 * lets the entry go when the dance itself would.
 */
export function movesAtItem(program: DemoProgram, item: number): DanceMoves {
  const dance = danceAtItem(program, item);
  const cached = movesCache.get(dance);
  if (cached !== undefined) return cached;
  const built = danceMoves(dance);
  movesCache.set(dance, built);
  return built;
}

/** `moveStart(i, tt, m)`: an absolute, unwrapped evening beat. */
export function moveStartBeat(
  program: DemoProgram,
  item: number,
  timeThrough: number,
  move: number,
): Beat {
  const moves = movesAtItem(program, item);
  return item * ITEM_BEATS + timeThrough * CYCLE_BEATS + moves.moves[move]!.start;
}

/**
 * A4: a target below 0 is moved one lap forward. Every transport function
 * routes its result through this — the only beat that is ever actually
 * negative is `danceStartBeat(0)` and the four potatoes before it, the one
 * place the evening's own arithmetic runs the clock earlier than its start.
 */
function normalise(program: DemoProgram, beat: Beat): Beat {
  return beat < 0 ? beat + program.totalBeats : beat;
}

/** Where a beat sits, in the unwrapped item arithmetic the transport reads. */
interface Geometry {
  /** Unwrapped item index: `floor(beat / ITEM_BEATS)`. */
  item: number;
  dancing: boolean;
  timeThrough: number;
  cycleBeat: Beat;
  /** The move `cycleBeat` is in — only set while `dancing`. */
  move: DanceMove | undefined;
}

function geometryAt(program: DemoProgram, beat: Beat): Geometry {
  const item = Math.floor(beat / ITEM_BEATS);
  const into = beat - item * ITEM_BEATS;
  const dancing = into < TIMES_THROUGH * CYCLE_BEATS;
  if (!dancing) {
    return {
      item,
      dancing,
      timeThrough: TIMES_THROUGH - 1,
      cycleBeat: CYCLE_BEATS,
      move: undefined,
    };
  }
  const timeThrough = Math.floor(into / CYCLE_BEATS);
  const cycleBeat = into - timeThrough * CYCLE_BEATS;
  return {
    item,
    dancing,
    timeThrough,
    cycleBeat,
    move: moveAt(movesAtItem(program, item), cycleBeat),
  };
}

/**
 * A3: "the dance now" — while dancing, the dance you are in; while lining up,
 * the one being announced. The between-dances interval that follows dance
 * `item` is entirely about the dance that comes next, which is why it is
 * `item + 1` and not `item`.
 */
function currentItem(geo: Geometry): number {
  return geo.dancing ? geo.item : geo.item + 1;
}

const GLYPH = { prevDance: "|◀◀", prevMove: "|◀", nextMove: "▶|", nextDance: "▶▶|" };

/**
 * A move target's label: `"|◀ → A2 · LONG LINES FORWARD AND BACK"`. The
 * dance's own title goes in only when the target is a different dance than
 * the one the press was made from (crossing into a line-up); the time
 * through goes in only when it differs from the one the press was made in —
 * copying the spike's own wording (`spikes/hall-page/index.html`'s
 * `prevMove`/`nextMove`).
 */
function moveLabel(
  glyph: string,
  dance: Dance,
  move: DanceMove,
  opts: { timeThrough?: number; otherDance?: boolean } = {},
): string {
  const title = opts.otherDance === true ? `${dance.title} ` : "";
  const tt =
    opts.timeThrough === undefined ? "" : ` (time through ${String(opts.timeThrough + 1)})`;
  return `${glyph} → ${title}${move.phrase} · ${move.call}${tt}`;
}

/** A dance target's label — always the potatoes, per the |◀◀ ruling below. */
function danceLabel(glyph: string, dance: Dance): string {
  return `${glyph} → the potatoes for ${dance.title}`;
}

/**
 * |◀: restart the move you are on, or the previous one within
 * {@link PREV_THRESHOLD_BEATS} of its start; run off the front of a dance and
 * it goes to the dance's own start (the potatoes), never past it — that is
 * |◀◀'s job. While lining up there is no "current move" to restart, so |◀
 * always goes to the last move of the dance that just finished, on its last
 * time through.
 */
export function prevMove(program: DemoProgram, beat: Beat): Target {
  const geo = geometryAt(program, beat);
  const dance = danceAtItem(program, geo.item);
  if (!geo.dancing) {
    const moves = movesAtItem(program, geo.item);
    const last = moves.moves[moves.moves.length - 1]!;
    const target = moveStartBeat(program, geo.item, TIMES_THROUGH - 1, last.index);
    return {
      beat: normalise(program, target),
      label: moveLabel(GLYPH.prevMove, dance, last, { timeThrough: TIMES_THROUGH - 1 }),
    };
  }
  const move = geo.move!;
  const current = moveStartBeat(program, geo.item, geo.timeThrough, move.index);
  if (beat - current >= PREV_THRESHOLD_BEATS) {
    return { beat: normalise(program, current), label: moveLabel(GLYPH.prevMove, dance, move) };
  }
  const moves = movesAtItem(program, geo.item);
  if (move.index > 0) {
    const prev = moves.moves[move.index - 1]!;
    const target = moveStartBeat(program, geo.item, geo.timeThrough, prev.index);
    return { beat: normalise(program, target), label: moveLabel(GLYPH.prevMove, dance, prev) };
  }
  if (geo.timeThrough > 0) {
    const last = moves.moves[moves.moves.length - 1]!;
    const target = moveStartBeat(program, geo.item, geo.timeThrough - 1, last.index);
    return {
      beat: normalise(program, target),
      label: moveLabel(GLYPH.prevMove, dance, last, { timeThrough: geo.timeThrough - 1 }),
    };
  }
  return {
    beat: normalise(program, danceStartBeat(geo.item)),
    label: danceLabel(GLYPH.prevMove, dance),
  };
}

/**
 * ▶|: the next move, then the first move of the next time through, then the
 * next dance's own start (its potatoes). While lining up it is always the
 * first move of the dance now (A3) — the CD-player rule is |◀'s alone.
 */
export function nextMove(program: DemoProgram, beat: Beat): Target {
  const geo = geometryAt(program, beat);
  if (!geo.dancing) {
    const c = currentItem(geo);
    const dance = danceAtItem(program, c);
    const first = movesAtItem(program, c).moves[0]!;
    const target = moveStartBeat(program, c, 0, first.index);
    return {
      beat: normalise(program, target),
      label: moveLabel(GLYPH.nextMove, dance, first, { otherDance: true }),
    };
  }
  const dance = danceAtItem(program, geo.item);
  const move = geo.move!;
  const moves = movesAtItem(program, geo.item);
  if (move.index + 1 < moves.moves.length) {
    const next = moves.moves[move.index + 1]!;
    const target = moveStartBeat(program, geo.item, geo.timeThrough, next.index);
    return { beat: normalise(program, target), label: moveLabel(GLYPH.nextMove, dance, next) };
  }
  if (geo.timeThrough + 1 < TIMES_THROUGH) {
    const first = moves.moves[0]!;
    const target = moveStartBeat(program, geo.item, geo.timeThrough + 1, first.index);
    return {
      beat: normalise(program, target),
      label: moveLabel(GLYPH.nextMove, dance, first, { timeThrough: geo.timeThrough + 1 }),
    };
  }
  const next = danceAtItem(program, geo.item + 1);
  return {
    beat: normalise(program, danceStartBeat(geo.item + 1)),
    label: danceLabel(GLYPH.nextMove, next),
  };
}

/**
 * |◀◀: the dance now's own start — the potatoes, **not** the whole line-up,
 * because "a caller practising needs the count-in" (Yona, round 2) — or the
 * previous dance's, pressed again within {@link PREV_THRESHOLD_BEATS} of
 * having just landed there. Always restarts while genuinely dancing: the
 * dance now's potatoes are at least four beats behind you the moment you are
 * dancing at all, which is already past the threshold.
 */
export function prevDance(program: DemoProgram, beat: Beat): Target {
  const geo = geometryAt(program, beat);
  const c = currentItem(geo);
  const start = danceStartBeat(c);
  const diff = beat - start;
  if (diff >= 0 && diff < PREV_THRESHOLD_BEATS) {
    const previous = danceAtItem(program, c - 1);
    return {
      beat: normalise(program, danceStartBeat(c - 1)),
      label: danceLabel(GLYPH.prevDance, previous),
    };
  }
  return {
    beat: normalise(program, start),
    label: danceLabel(GLYPH.prevDance, danceAtItem(program, c)),
  };
}

/** ▶▶|: the dance after the dance now's own start (its potatoes). Never "previous" — that is |◀◀'s rule alone. */
export function nextDance(program: DemoProgram, beat: Beat): Target {
  const geo = geometryAt(program, beat);
  const c = currentItem(geo);
  return {
    beat: normalise(program, danceStartBeat(c + 1)),
    label: danceLabel(GLYPH.nextDance, danceAtItem(program, c + 1)),
  };
}

/**
 * A tap on move `m` of the dance now (the upcoming one while lining up, A3):
 * its start in the current time through — the notecard and the popup's
 * "Jump here" both read this the same way (AC6, AC7).
 */
export function moveTarget(program: DemoProgram, beat: Beat, move: number): Target {
  const geo = geometryAt(program, beat);
  const item = currentItem(geo);
  const timeThrough = geo.dancing ? geo.timeThrough : 0;
  const dance = danceAtItem(program, item);
  const target = movesAtItem(program, item).moves[move]!;
  return {
    beat: normalise(program, moveStartBeat(program, item, timeThrough, move)),
    label: moveLabel("tap", dance, target, geo.dancing ? {} : { otherDance: true }),
  };
}

/**
 * A click on a bar of the tune: the move that cycle beat is in, in the dance
 * now's current time through (AC8). Clamped to the first move rather than
 * thrown on a cycle beat past the dance's own length, which a caller's own
 * `cycleBeat` arithmetic should never hand this, but a stray click should not
 * take the page down over.
 */
export function barTarget(program: DemoProgram, beat: Beat, cycleBeat: number): Target {
  const geo = geometryAt(program, beat);
  const item = currentItem(geo);
  const timeThrough = geo.dancing ? geo.timeThrough : 0;
  const dance = danceAtItem(program, item);
  const moves = movesAtItem(program, item);
  const move = moveAt(moves, cycleBeat) ?? moves.moves[0]!;
  return {
    beat: normalise(program, moveStartBeat(program, item, timeThrough, move.index)),
    label: moveLabel("bar", dance, move, geo.dancing ? {} : { otherDance: true }),
  };
}
