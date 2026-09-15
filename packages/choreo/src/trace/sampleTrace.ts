import type { Angle, Beat, Vec2 } from "@caller/core";
import type { DancerId, RoleName, StationId } from "../formation/Formation.js";
import type { Frame } from "../formation/Frame.js";
import { localAngle, localPoint } from "../formation/Frame.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import type { FigureEvent, Timeline } from "../timeline/Timeline.js";
import { poseAt } from "../timeline/poseAt.js";

/**
 * A trace: where every dancer's feet went over a window of a timeline, in the
 * set's own axes, tagged with the figure instance that owns each sample.
 *
 * This is the data behind the four drawings of a dance — pen plot, march,
 * seismograph, figure strip — and it is pure data: no colours, no pixels, no
 * drawing. `@caller/hall` draws it; this package only measures it.
 *
 * Positions are reported in one **fixed** frame for the whole window, not in
 * whichever group frame happens to own a sample. That is deliberate: a contra
 * set mints a fresh group every time through and a becket set re-centres after
 * the slide, so re-framing per sample would break the ink exactly where the
 * dancers are still walking. One frame means the progression draws as the
 * travel it actually is.
 */

/** How often a trace samples, in beats: eight samples to the beat. */
export const TRACE_STEP: Beat = 1 / 8;

/**
 * The figures that lose a strip cell to a real one dancing over the same beats.
 *
 * A call with a `who` leaves the rest of the group standing, and the decider
 * covers them with {@link WALK_TO_STATION} or {@link WAIT_OUT}. Both are real
 * figure events and both stay in {@link Trace.spans}; neither should be what
 * the strip writes under the cell when somebody in the same group is chaining.
 */
export const TRACE_FILLER_FIGURES: readonly string[] = [WALK_TO_STATION.id, WAIT_OUT.id];

/** One sample of one pen: where a dancer stood, and which way they faced. */
export interface TraceSample {
  beat: Beat;
  /** Set-local px: `x` across the set, `y` along it (down the hall is `+y`). */
  p: Vec2;
  /** Set-local degrees, the same convention as a station's `facing`. */
  facing: Angle;
  /** Index into {@link Trace.spans} of the figure that owns this sample. */
  span: number;
  /**
   * True on the first sample after {@link TraceOptions.wrap} has folded `y`
   * into a fresh lap of the period: the renderer breaks the ink here rather
   * than drawing a line across the fold (T6). Never set when `wrap` was not
   * asked for.
   */
  wrapped?: boolean;
}

/** One dancer, drawn as one pen. */
export interface TracePen {
  dancer: DancerId;
  /** The station this dancer stood on when the window opened, e.g. `"1L"`. */
  station: StationId;
  /** That station's role, from the formation's role set, e.g. `"lark"`. */
  role: RoleName;
  /**
   * Which sub-unit of the group the station belongs to: contra's ones are 1 and
   * its twos are 2. Read from the leading digits of the station id, which is
   * how every formation in the workspace names them, and overridable with
   * {@link TraceOptions.rankOf} for one that does not.
   */
  rank: number;
  samples: readonly TraceSample[];
}

/** One figure instance the window covers, as the trace tags it. */
export interface TraceSpan {
  /** The figure id, e.g. `"robins-chain"`. */
  figure: string;
  from: Beat;
  to: Beat;
  /** The dancers of this trace that danced it, in pen order. */
  dancers: readonly DancerId[];
}

/** One cell of the figure strip: one call, however many figures covered it. */
export interface TraceCell {
  /** The figure id the cell is named for: the one most of the group danced. */
  figure: string;
  from: Beat;
  to: Beat;
  /**
   * What the cell is coloured by. `familyOf` decides; with no classifier every
   * figure is its own family, which still makes a repeated figure repeat a
   * colour.
   */
  family: string;
}

/** Every pen's whole path over one window, and the figures that drew it. */
export interface Trace {
  from: Beat;
  to: Beat;
  step: Beat;
  pens: readonly TracePen[];
  spans: readonly TraceSpan[];
  cells: readonly TraceCell[];
  /** How far the ink reaches from the frame's centre, in set-local px. */
  extent: { x: number; y: number };
}

/** What to trace, and how. */
export interface TraceOptions {
  /** How far into the timeline the window runs. Required: traces are finite. */
  to: Beat;
  /** Where it opens. Default 0. */
  from?: Beat;
  /** Which dancers get a pen. Default: everybody the window covers. */
  dancers?: readonly DancerId[];
  /** Sampling interval. Default {@link TRACE_STEP}. */
  step?: Beat;
  /** The axes to report in. Default: the frame of the first figure traced. */
  frame?: Frame;
  /**
   * Which sub-unit a dancer belongs to. Default: the station's leading digits,
   * else 0.
   *
   * The **dancer** is the second argument because a station id is not always
   * enough to tell: a caller may trace a window whose figures are resolved one
   * instance per pair, where the station a pen opened on is the figure's own
   * part (`lark`) rather than a place in the set, and two instances of the same
   * call use the same part names. Whoever asked for the trace knows who is who;
   * the sampler does not.
   */
  rankOf?: (station: StationId, dancer: DancerId) => number;
  /** What to colour a strip cell by. Default: the figure id itself. */
  familyOf?: (figure: string) => string;
  /** Figure ids that lose a cell. Default {@link TRACE_FILLER_FIGURES}. */
  filler?: readonly string[];
  /**
   * Fold each sample's along-hall `y` into one period centred on the frame,
   * `y ∈ [−pitch/2, +pitch/2)`, and mark the first sample after each fold
   * with {@link TraceSample.wrapped}. Facing is unchanged; `extent` is
   * computed **after** the fold.
   *
   * Off by default: a fixed frame draws the progression as the travel it
   * actually is, which is what a figure's own picture wants (the header
   * comment above). A dance whose progression carries the group down the
   * hall — a becket slide, a duple improper minor set is not one, since the
   * couples merely swap places — grows `extent.y` without bound over a long
   * enough window; folding is what keeps the shape the size of one minor set.
   * `y` is the sampler's own convention (down the hall), never `x`: nothing
   * in this package's own geometry drifts across the set.
   */
  wrap?: { y: number };
}

/** The rank a station's id names: `"2R"` is 2, `"WL"` is 0. */
export function stationRank(station: StationId): number {
  const digits = /^\d+/.exec(station);
  return digits === null ? 0 : Number(digits[0]);
}

/**
 * Fold `y` into the lap of `period` nearest zero: `y - lap * period`, which
 * lands in `[−period/2, +period/2]`, plus which lap it came from.
 *
 * The lap is what {@link sampleTrace} compares between consecutive samples to
 * mark a wrap — a change of lap is a fold, whether or not the folded value
 * itself happens to jump far (a dancer easing to a stop right at the fold
 * would barely move at all in the folded picture, and still wants the break).
 */
function foldToPeriod(y: number, period: number): { y: number; lap: number } {
  const lap = Math.round(y / period);
  return { y: y - lap * period, lap };
}

/**
 * Walk the timeline and write down where everybody went.
 *
 * Every sample comes from `poseAt`, the same call the renderer makes every
 * frame, so a trace is what the hall draws and not a second opinion about it.
 */
export function sampleTrace(timeline: Timeline, options: TraceOptions): Trace {
  const from = options.from ?? 0;
  const to = options.to;
  if (!(to > from)) throw new Error(`trace window must run forwards, got ${from}..${to}`);
  const step = options.step ?? TRACE_STEP;
  if (!(step > 0)) throw new Error(`trace step must be positive, got ${step}`);
  const rankOf = options.rankOf ?? stationRank;
  const familyOf = options.familyOf ?? ((figure: string) => figure);
  const filler = new Set(options.filler ?? TRACE_FILLER_FIGURES);

  const dancers = (options.dancers ?? timeline.dancers()).filter((dancer) =>
    covers(timeline, dancer, from, to),
  );
  if (dancers.length === 0) throw new Error(`no dancer is covered over beats ${from}..${to}`);

  const events = tracedEvents(timeline, dancers, from, to);
  const frame = options.frame ?? timeline.group(events[0]!.group).frame;

  const spans: TraceSpan[] = events.map((event) => ({
    figure: event.figure,
    from: event.start,
    to: event.end,
    dancers: dancers.filter((dancer) => bindingOfEvent(event, dancer) !== undefined),
  }));
  const spanIndex = new Map(events.map((event, i) => [event, i]));

  const pens: TracePen[] = [];
  let extentX = 0;
  let extentY = 0;
  for (const dancer of dancers) {
    const opening = timeline.figureAt(dancer, from);
    const station = opening === undefined ? "" : (bindingOfEvent(opening, dancer) ?? "");
    const role = opening === undefined ? "" : roleOn(timeline, opening, station);
    const samples: TraceSample[] = [];
    let span = -1;
    let lap: number | undefined;
    for (const beat of beatsOf(from, to, step)) {
      const pose = poseAt(timeline, dancer, beat);
      let p = localPoint(frame, pose.p);
      const event = timeline.figureAt(dancer, beat);
      // The sample that lands exactly on `to` belongs to the next figure, which
      // the window does not cover; it keeps the tag of the figure it closes.
      const owner = event === undefined ? undefined : spanIndex.get(event);
      span = owner ?? span;
      let wrapped: boolean | undefined;
      if (options.wrap !== undefined && options.wrap.y > 0) {
        const folded = foldToPeriod(p[1], options.wrap.y);
        wrapped = lap !== undefined && folded.lap !== lap;
        lap = folded.lap;
        p = [p[0], folded.y];
      }
      samples.push({
        beat,
        p,
        facing: localAngle(frame, pose.facing),
        span,
        ...(wrapped === undefined ? {} : { wrapped }),
      });
      extentX = Math.max(extentX, Math.abs(p[0]));
      extentY = Math.max(extentY, Math.abs(p[1]));
    }
    pens.push({ dancer, station, role, rank: rankOf(station, dancer), samples });
  }

  return {
    from,
    to,
    step,
    pens,
    spans,
    cells: cellsOf(spans, filler, familyOf),
    extent: { x: extentX, y: extentY },
  };
}

/** Whether this dancer has a figure over the whole window. */
function covers(timeline: Timeline, dancer: DancerId, from: Beat, to: Beat): boolean {
  const events = timeline.figuresOf(dancer);
  if (events.length === 0) return false;
  const first = events[0]!;
  const last = events[events.length - 1]!;
  return first.start <= from && last.end >= to;
}

/** Every figure event any traced dancer dances inside the window, in order. */
function tracedEvents(
  timeline: Timeline,
  dancers: readonly DancerId[],
  from: Beat,
  to: Beat,
): readonly FigureEvent[] {
  const seen = new Set<FigureEvent>();
  for (const dancer of dancers) {
    for (const event of timeline.figuresOf(dancer)) {
      if (event.end <= from || event.start >= to) continue;
      seen.add(event);
    }
  }
  const events = [...seen].sort(
    (a, b) => a.start - b.start || a.end - b.end || (a.figure < b.figure ? -1 : 1),
  );
  if (events.length === 0) throw new Error(`no figure covers beats ${from}..${to}`);
  return events;
}

/** The station this event bound this dancer to. */
function bindingOfEvent(event: FigureEvent, dancer: DancerId): StationId | undefined {
  for (const [station, id] of Object.entries(event.bindings)) {
    if (id === dancer) return station;
  }
  return undefined;
}

/** The role of the station a dancer opened the window on. */
function roleOn(timeline: Timeline, event: FigureEvent, station: StationId): RoleName {
  const group = timeline.group(event.group);
  return group.stations.find((s) => s.id === station)?.role ?? "";
}

/** Every sampled beat of the window, the last one landing exactly on `to`. */
function beatsOf(from: Beat, to: Beat, step: Beat): Beat[] {
  const out: Beat[] = [];
  const count = Math.max(1, Math.round((to - from) / step));
  for (let i = 0; i <= count; i++) out.push(from + Math.min(to - from, i * step));
  return out;
}

/**
 * One cell per call: the spans that share a window, collapsed to the figure
 * most of the group danced, with a filler figure never beating a real one.
 */
function cellsOf(
  spans: readonly TraceSpan[],
  filler: ReadonlySet<string>,
  familyOf: (figure: string) => string,
): TraceCell[] {
  const byWindow = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    const key = `${String(span.from)}..${String(span.to)}`;
    const group = byWindow.get(key);
    if (group === undefined) byWindow.set(key, [span]);
    else group.push(span);
  }
  const cells: TraceCell[] = [];
  for (const group of byWindow.values()) {
    const best = [...group].sort((a, b) => {
      const fa = filler.has(a.figure) ? 1 : 0;
      const fb = filler.has(b.figure) ? 1 : 0;
      if (fa !== fb) return fa - fb;
      if (a.dancers.length !== b.dancers.length) return b.dancers.length - a.dancers.length;
      return a.figure < b.figure ? -1 : 1;
    })[0]!;
    cells.push({
      figure: best.figure,
      from: best.from,
      to: best.to,
      family: familyOf(best.figure),
    });
  }
  return cells.sort((a, b) => a.from - b.from || a.to - b.to);
}
