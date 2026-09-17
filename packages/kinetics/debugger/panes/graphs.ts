import { EFFECTORS, JOINTS, type Channel, type PointName } from "../../src/body/Body.js";
import type { DancerId } from "../../src/dialect/Dialect.js";
import { kinematicsOf } from "../../src/motion/prove.js";
import { beatOf, type Trajectory } from "../../src/motion/Trajectory.js";
import type { Run } from "../../src/pipeline.js";
import { ANGULAR_CAPS, capsAtTempo } from "../../src/units/caps.js";
import { degPerBeat } from "../../src/units/Tempo.js";
import { colourOf, el, paneShell, svg, type Pane, type View } from "../view.js";

const STRIP = 44;
const GUTTER = 66;
const CAP_FRACTION = 0.7;

/**
 * Every point against the cap it must not break, and every red dot the proof
 * found. Speed is the bright line, acceleration the faint one, and both are
 * drawn as **multiples of their own cap** so one dashed line serves both and
 * a strip can be read without arithmetic: on the line is at the limit, above
 * it is a body that could not have done this.
 *
 * The dots are not decoration. A strip with none is a proof that passed; the
 * ones that remain (the hip where a walk starts, the torso and the neck at
 * their rate limits) are open work, shown rather than hidden.
 */
export function graphsPane(): Pane {
  const { section, body } = paneShell("graphs");
  const column = el("div", "strips");
  body.append(column);

  let view: View | undefined;
  let cursors: SVGLineElement[] = [];
  let endBeat = 1;
  let plotW = 0;
  let width = 0;

  const draw = (): void => {
    if (!view) return;
    const { run, pick } = view;
    width = Math.max(body.clientWidth - 2, 200);
    plotW = Math.max(width - GUTTER - 8, 40);
    endBeat = Math.max(run.endBeat, 1);
    column.replaceChildren();
    cursors = [];
    if (!run.solved) {
      column.append(el("div", "empty", "nothing solved"));
      return;
    }
    const caps = capsAtTempo(run.tempo);
    const bands = callBands(run, pick[0]);
    const violations = violationsOf(run);

    for (const point of [...EFFECTORS, ...JOINTS]) {
      const series = pick.flatMap((dancer) => {
        const t = run.solved?.trajectories[dancer];
        if (!t?.points[point]) return [];
        const kin = kinematicsOf(t, point);
        return [{ dancer, t, speed: kin.speed, accel: kin.accel }];
      });
      const cap = caps[point];
      strip(
        point,
        (EFFECTORS as readonly string[]).includes(point) ? "effector" : "joint",
        `${cap.speedPxPerBeat.toFixed(0)} px/b`,
        series.map((s) => ({
          dancer: s.dancer,
          t: s.t,
          main: s.speed.map((v) => v / cap.speedPxPerBeat),
          faint: s.accel.map((v) => v / cap.accelPxPerBeat2),
        })),
        violations.filter((v) => v.point === point),
        bands,
      );
    }

    for (const [channel, capDegPerS] of [
      ["facing", ANGULAR_CAPS.yawDegPerS],
      ["headYaw", ANGULAR_CAPS.lookDegPerS],
    ] as const) {
      const capPerBeat = degPerBeat(run.tempo, capDegPerS);
      const series = pick.flatMap((dancer) => {
        const t = run.solved?.trajectories[dancer];
        const values = t?.channels[channel as Channel];
        if (!t || !values) return [];
        const rate = rateOf(values, t.tempo.samplesPerBeat);
        return [
          {
            dancer,
            t,
            main: rate.map((v) => v / capPerBeat),
            // An angular cap table with no acceleration row for the neck: the
            // rate is the whole story on these two strips.
            faint: [],
          },
        ];
      });
      strip(
        `${channel} rate`,
        "angle",
        `${capDegPerS}°/s`,
        series,
        violations.filter((v) => v.point === channel),
        bands,
      );
    }
  };

  const strip = (
    name: string,
    tag: string,
    capText: string,
    series: readonly {
      dancer: DancerId;
      t: Trajectory;
      main: readonly number[];
      faint: readonly number[];
    }[],
    dots: readonly Dot[],
    bands: readonly [number, number][],
  ): void => {
    if (!view) return;
    const root = svg("svg", {
      width,
      height: STRIP,
      viewBox: `0 0 ${width} ${STRIP}`,
      class: "strip",
    });
    const top = 4;
    const bottom = STRIP - 6;
    const x = (beat: number): number => GUTTER + (beat / endBeat) * plotW;
    const y = (ratio: number): number =>
      bottom - Math.min(Math.max(ratio, 0), 1.35) * (bottom - top) * CAP_FRACTION;

    bands.forEach(([from, to], i) => {
      if (i % 2 === 1) return;
      root.append(
        svg("rect", {
          x: x(from),
          y: top,
          width: x(to) - x(from),
          height: bottom - top,
          class: "band",
        }),
      );
    });
    root.append(svg("line", { x1: GUTTER, y1: bottom, x2: width - 8, y2: bottom, class: "axis" }));
    root.append(svg("line", { x1: GUTTER, y1: y(1), x2: width - 8, y2: y(1), class: "cap" }));
    root.append(svg("text", { x: 2, y: 16, class: "strip-name" }, name));
    root.append(svg("text", { x: 2, y: 27, class: "strip-tag" }, tag));
    root.append(svg("text", { x: 2, y: 38, class: "strip-cap" }, capText));

    for (const s of series) {
      const colour = colourOf(view.run, s.dancer);
      for (const [values, cls] of [
        [s.faint, "accel"],
        [s.main, "speed"],
      ] as const) {
        if (values.length === 0) continue;
        const step = Math.max(1, Math.floor(values.length / (plotW * 1.5)));
        const points: string[] = [];
        for (let i = 0; i < values.length; i += step) {
          points.push(`${x(beatOf(s.t, i)).toFixed(1)},${y(values[i] ?? 0).toFixed(1)}`);
        }
        root.append(
          svg("polyline", { points: points.join(" "), stroke: colour, class: `line ${cls}` }),
        );
      }
    }
    for (const dot of dots) {
      if (!series.some((s) => s.dancer === dot.dancer)) continue;
      root.append(
        svg("circle", { cx: x(dot.beat), cy: y(dot.value / dot.cap), r: 2, class: "dot" }),
      );
    }
    const cursor = svg("line", { x1: GUTTER, y1: 0, x2: GUTTER, y2: STRIP, class: "cursor" });
    root.append(cursor);
    cursors.push(cursor);
    column.append(root);
  };

  new ResizeObserver(() => {
    if (Math.abs(body.clientWidth - 2 - width) > 1) draw();
  }).observe(body);

  return {
    el: section,
    setRun(next) {
      view = next;
      draw();
    },
    setBeat(beat) {
      const x = GUTTER + (beat / endBeat) * plotW;
      for (const cursor of cursors) {
        cursor.setAttribute("x1", String(x));
        cursor.setAttribute("x2", String(x));
      }
    },
  };
}

interface Dot {
  dancer: DancerId;
  point: PointName | Channel;
  beat: number;
  value: number;
  cap: number;
}

/** Every complaint the executor, the solver and the proof made, in one list. */
const violationsOf = (run: Run): Dot[] => [
  ...(run.executed?.violations ?? []),
  ...(run.solved?.violations ?? []),
];

/** The calls of one dancer as beat ranges, for the faint bands behind a strip. */
const callBands = (run: Run, dancer: DancerId | undefined): [number, number][] =>
  dancer === undefined ? [] : (run.sequence?.perDancer[dancer] ?? []).map((c) => [c.start, c.end]);

/** Degrees per beat, by central difference, with each step taken the short way round. */
const rateOf = (values: readonly number[], samplesPerBeat: number): number[] => {
  const out: number[] = new Array(values.length).fill(0);
  const shortWay = (d: number): number => d - 360 * Math.round(d / 360);
  for (let i = 1; i < values.length - 1; i++) {
    out[i] = Math.abs(shortWay((values[i + 1] ?? 0) - (values[i - 1] ?? 0)) / 2) * samplesPerBeat;
  }
  if (values.length > 1) {
    out[0] = out[1] ?? 0;
    out[values.length - 1] = out[values.length - 2] ?? 0;
  }
  return out;
};
