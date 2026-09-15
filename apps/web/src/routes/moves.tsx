import type { Beat, Clock, Vec2 } from "@caller/core";
import { createClock } from "@caller/core";
import type { DancerId, Group } from "@caller/choreo";
import type { FacingStyle, Person, Renderer } from "@caller/hall";
import { FONT, GLYPH_H, ROLE_COLOURS, createPerson, createRenderer, drawText } from "@caller/hall";
import type { CSSProperties, JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GalleryCall, GalleryTile, TileMetric, TileVariant } from "../galleryTiles.js";
import {
  DEFAULT_ZOOM,
  FLOOR_COLOUR,
  GALLERY_ZOOMS,
  SOLO_ZOOM,
  TILE_MARGIN_PX,
  galleryTiles,
  maxTileWorld,
  tileMetrics,
  variantTile,
} from "../galleryTiles.js";
import { hallFrame, seedOf } from "../hallFrame.js";
import type { MoveEntry, MoveFamily, MoveVariant } from "../moveCatalogue.js";
import { moveCatalogue } from "../moveCatalogue.js";
import { paramText, paramValueText, roleColourOf } from "../moveParams.js";
import type { EngineChoice } from "../state/engineQuery.js";
import { engineFromQuery } from "../state/engineQuery.js";
import { FigureTraces } from "../traces/FigureTraces.js";
import type { RowTraceView } from "../traces/traceDrawings.js";
import { facingFromQuery, viewFromQuery } from "../traces/traceDrawings.js";

/**
 * The Moves tab: **a browser of the figure definitions the library holds**
 * (M12), one row per definition, filed in families read off the definitions'
 * own shape kinds.
 *
 * Until M12 the page was a gallery of tiles over a hand-written list of figure
 * ids, which was a list of the *coded* figures — the thing the rebuild is
 * retiring. Now the page asks the library what it holds and shows, for each
 * definition: the caller's shorthand parameters with the canonical expansion
 * the shape actually runs on, the figure-roles, the nominal count, the timing
 * profile, where the figure leaves people, the move's four texts
 * (`data/figures/<id>.json`), the **parameter rows** — the same figure at
 * another tuning, generated from the parameter spec, the record and the texts
 * rather than listed by hand — the **dance ↔ figure index**, and the seams that
 * leave it.
 *
 * Every tile reads a `Timeline` with `poseAt`, exactly as the hall does. The
 * page never calls `FigureDef.sample`, so a figure that looks wrong here looks
 * wrong on the Stage tab too — which is the whole point of the gallery.
 *
 * One move to a row, never a grid (U2): the tile on the left in a slot as wide
 * as the widest world in the gallery, so every set stands on the same axis and
 * the writing beside them starts in the same column. Phone first (U1): the
 * three lists a row can open — its parameter rows, the dances that call it, the
 * seams that leave it — are all disclosures, closed, so the default page is one
 * screen-width of tile and one paragraph of prose per move.
 *
 * Deep links, which are what a review is conducted in:
 *
 * - `#/moves` — everything.
 * - `#/moves/<figure-id>` — one definition alone, at 4&times;.
 * - `#/moves/<figure-id>~<param>=<value>` — one **parameter row** alone.
 * - `#/moves/seam/<a>--<b>` — one seam alone, at 4&times;.
 * - `?beat=<n>` freezes; `?zoom=<n>`; `?speed=<n>`; `?trails=1`;
 *   `?strip=1&step=<beats>` shows the one-frame-per-step strip;
 *   `?bare=1` renders only the canvas, for screenshots. `pnpm figure <id>`'s
 *   three pictures come from exactly these routes (`e2e/figureLab.spec.ts`).
 * - `?facing=ticks` or `?facing=arrowheads` swaps the row's pen-plot facing
 *   style away from the shipped default, which is the user's wake since T5 —
 *   no rebuild needed to compare the three on a phone.
 * - `?view=march` or `?view=seismograph` opens every row's trace panel on
 *   that view instead of the shipped default (`plot`, the pen plot); a small
 *   switch in each panel changes it from there for the rest of the visit
 *   (T4). `#/moves/<figure-id>/traces` shows all three, plus the strip, at
 *   full width with a reading guide each.
 */

/** The tempo the gallery loops at, matching the pair page's plain clock. */
const BPM = 112;

/** How long the shared scrubber is: one time through of a dance. */
const SCRUB_BEATS = 64;

/** The speeds the gallery offers. */
const SPEEDS = [0.25, 0.5, 1] as const;

/** Beats each side of a seam that a seam strip covers. */
export const SEAM_STRIP_BEATS = 4;

/** The most cells a strip draws, however long the figure is. */
export const MAX_STRIP_CELLS = 32;

/** The strip's step on the page. The e2e strips ask for half a beat. */
const DEFAULT_STRIP_STEP = 1;

/** Ink for the beat number under each strip cell, in the hall's own font. */
const STRIP_INK = "#3b2a17";

export function MovesPage({
  path,
  params,
}: {
  /** What follows `#/moves`: `""`, `"/balance"`, `"/hey~amount=0.5"`, `"/seam/balance--swing"`. */
  path: string;
  params: URLSearchParams;
}): JSX.Element {
  const engine = engineFromQuery(params.get("engine"));
  const catalogue = useCatalogue();
  const tiles = useTiles(engine);
  const solo = soloKey(path);
  const found = useMemo(
    () => (solo === null ? {} : soloTile(solo, tiles, catalogue, engine)),
    [solo, tiles, catalogue, engine],
  );
  const single = found.tile;
  // A deep link that names nothing is an empty page with a line saying so, not
  // the whole gallery: `#/moves/not-a-figure` must not quietly show everything.
  const shown = useMemo(
    () => (solo === null ? tiles : single === undefined ? [] : [single]),
    [tiles, solo, single],
  );

  const frozen = params.get("beat");
  const bare = params.get("bare") === "1";
  const stripOnly = params.get("strip") === "1";
  const step = Number(params.get("step") ?? DEFAULT_STRIP_STEP) || DEFAULT_STRIP_STEP;
  const facing = facingFromQuery(params.get("facing"));

  const [zoom, setZoom] = useState(() => zoomFrom(params.get("zoom"), solo !== null));
  const [speed, setSpeed] = useState(() => speedFrom(params.get("speed")));
  const [trails, setTrails] = useState(params.get("trails") === "1");
  const [view, setView] = useState<RowTraceView>(() => viewFromQuery(params.get("view")));
  const [beat, setBeat] = useState(() => (frozen === null ? 0 : Number(frozen)));
  const [paused, setPaused] = useState(frozen !== null);
  const [strips, setStrips] = useState<ReadonlySet<string>>(
    () => new Set(stripOnly && solo !== null ? [solo] : []),
  );
  // U4: the seams of each figure sit behind a "transitions" disclosure,
  // collapsed by default (the user: "what are all the 'robins-chain → hey'
  // moves? that seems odd" — to a caller they read as moves that do not
  // exist). This is which figures' disclosures are open, so the header's own
  // seam count can stay quiet until at least one is.
  const [openTransitions, setOpenTransitions] = useState<ReadonlySet<string>>(new Set());
  const metrics = useMetrics(shown, bare);

  const clock = useMemo<Clock>(() => {
    const c = createClock(() => performance.now() / 1000, BPM);
    if (frozen !== null) {
      c.setBeat(Number(frozen));
      c.pause();
    }
    return c;
  }, [frozen]);

  useEffect(() => {
    clock.setTempo(BPM * speed);
  }, [clock, speed]);

  // One rAF loop for the whole page: it only ever moves the beat, and every
  // tile draws from that one number.
  useEffect(() => {
    if (paused) return;
    let running = true;
    const tick = (): void => {
      if (!running) return;
      setBeat(clock.beat());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
    };
  }, [clock, paused]);

  const togglePlay = useCallback(() => {
    setPaused((was) => {
      if (was) clock.resume();
      else clock.pause();
      return !was;
    });
  }, [clock]);

  const toggleStrip = useCallback((key: string) => {
    setStrips((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (shown.length === 0) {
    return (
      <main className="p-6">
        <p data-testid="moves-missing" data-problem={found.problem === undefined ? "0" : "1"}>
          {found.problem === undefined ? (
            <>
              No move called <code>{solo}</code>.
            </>
          ) : (
            <>
              <code>{solo}</code> is a tuning this figure takes and this tile cannot draw:{" "}
              {found.problem}
            </>
          )}{" "}
          <a href="#/moves">Back to the gallery</a>.
        </p>
      </main>
    );
  }

  if (bare) {
    const tile = shown[0]!;
    return (
      <main className="w-fit">
        {stripOnly ? (
          <TileStrip tile={tile} zoom={zoom} step={step} />
        ) : (
          <TileCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} always />
        )}
      </main>
    );
  }

  const seamsOf = (id: string): GalleryTile[] =>
    tiles.filter((t) => t.kind === "seam" && t.under === id);
  const definitions = catalogue.flatMap((family) => family.moves);
  const seams = tiles.filter((t) => t.kind === "seam").length;
  // U4: the count line drops the seams unless a transitions disclosure is
  // open — otherwise "N figures and M seams" would announce the very rows
  // the disclosure exists to keep out of sight by default.
  const seamsOpen = openTransitions.size > 0;
  // The tile column is one width for the whole page: the widest world in the
  // gallery at the current zoom. Every set then stands on the same axis and
  // the writing beside them starts in the same column, which is the whole
  // point of a row — a slot per tile would be a ragged left edge.
  const world = maxTileWorld(shown.length === 1 ? shown : tiles);
  const slot = world.w * zoom;
  // The trace panels share one floor scale for the same reason, and it falls
  // out of the same number: a tile's world is its own travel plus
  // `TILE_MARGIN_PX` on every side, so the widest world minus that margin is
  // the widest ink on the page.
  const reach = Math.max(1, Math.max(world.w, world.h) / 2 - TILE_MARGIN_PX);

  const rowProps = {
    beat,
    zoom,
    trails,
    step,
    onStrip: toggleStrip,
    solo: solo !== null,
    side: slot,
    reach,
    facing,
    view,
    onView: setView,
  };

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">Moves</h1>
        <p className="max-w-[80ch] text-sm text-muted-foreground">
          {solo === null
            ? `${String(definitions.length)} figures the library holds${seamsOpen ? `, and ${String(seams)} seams` : ""}:`
            : "One move, on its own:"}{" "}
          what the figure <b>is</b> — its parts, its count, where it leaves people, the tuning it
          takes, the words a caller says — beside a tile of it danced by one two-couple set on the{" "}
          <b>{engine === "new" ? "new" : "old"}</b> engine
          {engine === "new" ? "" : " (?engine=old)"}. Its <i>parameter rows</i>, the dances that
          call it and the seams that leave it are each one tap away; a number in{" "}
          <span className="moves-over px-1">this colour</span> is over a derived bound, which is a
          thing to look at rather than a verdict. The{" "}
          <a href="#/lab" data-testid="moves-lab-link">
            seam lab
          </a>{" "}
          dances two of these seams through both engines at once.
        </p>
      </header>

      <div
        /*
         * Opaque, not 95%: the page ground carries a board grain now, and a
         * translucent shelf let both the grain and whatever row was under it
         * ghost through the controls. The rule under it is what says it is a
         * shelf rather than a gap.
         */
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-sm"
        data-testid="moves-controls"
        data-measured={metrics === null ? "0" : "1"}
      >
        <button
          type="button"
          onClick={togglePlay}
          data-testid="moves-play"
          className="min-h-9 rounded border px-3 py-1"
        >
          {paused ? "Play" : "Pause"}
        </button>
        <span className="flex items-center gap-1">
          zoom
          {GALLERY_ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={z === zoom}
              data-testid={`moves-zoom-${String(z)}`}
              className={`min-h-9 rounded border px-2 py-1 ${z === zoom ? "border-current font-semibold" : "opacity-60"}`}
            >
              {z}&times;
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          speed
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={s === speed}
              data-testid={`moves-speed-${String(s)}`}
              className={`min-h-9 rounded border px-2 py-1 ${s === speed ? "border-current font-semibold" : "opacity-60"}`}
            >
              {speedText(s)}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setTrails((on) => !on)}
          aria-pressed={trails}
          data-testid="moves-trails"
          className={`min-h-9 rounded border px-3 py-1 ${trails ? "border-current font-semibold" : "opacity-60"}`}
        >
          trails
        </button>
        {solo === null ? null : (
          <a href="#/moves" className="min-h-9 rounded border px-3 py-1" data-testid="moves-back">
            all moves
          </a>
        )}
        <label className="flex min-w-[14rem] flex-1 items-center gap-2">
          <span className="w-10 tabular-nums">{(beat % SCRUB_BEATS).toFixed(1)}</span>
          <input
            type="range"
            min={0}
            max={SCRUB_BEATS}
            step={0.05}
            value={beat % SCRUB_BEATS}
            onChange={(e) => {
              const v = Number(e.target.value);
              clock.setBeat(v);
              setBeat(v);
            }}
            data-testid="moves-scrub"
            className="h-9 flex-1"
          />
        </label>
      </div>

      {solo !== null ? (
        <ol
          className="moves-list"
          style={{ "--moves-tile-w": `${String(slot)}px` } as CSSProperties}
        >
          <li className="moves-group">
            <Row
              {...rowProps}
              tile={shown[0]!}
              entry={entryFor(catalogue, shown[0]!.under)}
              strip={strips.has(shown[0]!.key)}
              metrics={metrics?.get(shown[0]!.key)}
            />
          </li>
        </ol>
      ) : (
        <>
          <nav className="moves-families" data-testid="moves-families">
            {catalogue.map((family) => (
              <a key={family.id} href={`#family-${family.id}`} data-family={family.id}>
                {family.title} <span className="moves-row-dim">{family.moves.length}</span>
              </a>
            ))}
          </nav>

          <ol
            className="moves-list"
            style={{ "--moves-tile-w": `${String(slot)}px` } as CSSProperties}
          >
            {catalogue.map((family) => (
              <li key={family.id} className="moves-family" id={`family-${family.id}`}>
                <h2 className="moves-family-title" data-testid="moves-family" data-key={family.id}>
                  {family.title}{" "}
                  <span className="moves-row-dim">
                    {family.moves.length} &middot; <code>{family.id}</code>
                  </span>
                </h2>
                <p className="moves-family-blurb">{family.blurb}</p>
                <ol className="moves-family-list">
                  {family.moves.map((entry) => {
                    const tile = tiles.find((t) => t.kind === "figure" && t.key === entry.id);
                    if (tile === undefined) return null;
                    return (
                      <li key={entry.id} className="moves-group">
                        <Row
                          {...rowProps}
                          tile={tile}
                          entry={entry}
                          strip={strips.has(tile.key)}
                          metrics={metrics?.get(tile.key)}
                        />
                        <Variants entry={entry} zoom={zoom} step={step} engine={engine} />
                        <DanceIndex entry={entry} />
                        <Transitions
                          seams={seamsOf(entry.id)}
                          rowProps={rowProps}
                          strips={strips}
                          metrics={metrics}
                          onOpen={(open) =>
                            setOpenTransitions((was) => {
                              const next = new Set(was);
                              if (open) next.add(entry.id);
                              else next.delete(entry.id);
                              return next;
                            })
                          }
                        />
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

/** What every row is given, whichever list it is in. */
interface RowProps {
  beat: Beat;
  zoom: number;
  trails: boolean;
  step: number;
  onStrip: (key: string) => void;
  solo: boolean;
  side: number;
  reach: number;
  facing?: FacingStyle;
  view: RowTraceView;
  onView: (view: RowTraceView) => void;
}

/** The seams that leave one figure, behind their disclosure (U4). */
function Transitions({
  seams,
  rowProps,
  strips,
  metrics,
  onOpen,
}: {
  seams: readonly GalleryTile[];
  rowProps: RowProps;
  strips: ReadonlySet<string>;
  metrics: ReadonlyMap<string, TileMetric[]> | null;
  onOpen: (open: boolean) => void;
}): JSX.Element | null {
  if (seams.length === 0) return null;
  return (
    <details
      className="moves-transitions"
      data-testid="moves-transitions"
      onToggle={(e) => onOpen(e.currentTarget.open)}
    >
      <summary>transitions ({seams.length})</summary>
      <ol className="moves-seams">
        {seams.map((tile) => (
          <li key={tile.key}>
            <Row
              {...rowProps}
              tile={tile}
              strip={strips.has(tile.key)}
              metrics={metrics?.get(tile.key)}
            />
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * One move, one row: the looping canvas in the shared left column, everything
 * that is known about it on the right, and its strip under both when it is open.
 */
function Row({
  tile,
  entry,
  beat,
  zoom,
  trails,
  strip,
  step,
  onStrip,
  metrics,
  solo,
  side,
  reach,
  facing,
  view,
  onView,
}: RowProps & {
  tile: GalleryTile;
  /** The definition this row is of, where the row is a definition's own. */
  entry?: MoveEntry;
  strip: boolean;
  /** `undefined` until the page has measured; the line says so meanwhile. */
  metrics: TileMetric[] | undefined;
}): JSX.Element {
  // A seam row sits under the figure it comes out of, whose own row says what
  // that figure is, so the prose that is new here is the figure it goes into.
  // On its own deep link there is no row above it, so both are shown.
  const described = tile.kind === "seam" && !solo ? tile.calls.slice(-1) : tile.calls;

  return (
    <article
      className="moves-row"
      data-testid="moves-tile"
      data-key={tile.key}
      data-kind={tile.kind}
      data-beats={tile.window.beats}
      data-source={tile.source ?? ""}
      data-formation={tile.formation}
    >
      <div className="moves-row-tile">
        <TileCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} />
        <FigureTraces
          tile={tile}
          side={side}
          reach={reach}
          facing={facing}
          view={view}
          onView={onView}
        />
      </div>

      <div className="moves-row-head">
        <h2 className="moves-row-title">
          <a href={soloHref(tile)}>{tile.title}</a>
        </h2>
        {entry === undefined ? null : <Facts entry={entry} />}
        {tile.calls.map((call, i) => (
          <p key={i} className="moves-row-call">
            <span className="moves-row-callid">{call.figure}</span> {call.call}
            <span className="moves-row-dim">
              {" · "}
              {call.beats} beats
              {paramText(call.params) === "" ? "" : ` · ${paramText(call.params)}`}
            </span>
          </p>
        ))}
        <p className="moves-row-dim">
          {tile.formation}
          {tile.source === undefined ? " · figure defaults" : ` · from ${tile.source}`}
        </p>
        <Metrics tile={tile} metrics={metrics} />
      </div>

      <div className="moves-row-body">
        {described.map((call) => (
          <MoveText key={call.figure} call={call} named={tile.kind === "seam"} />
        ))}
        {entry === undefined ? null : <Params entry={entry} />}
        {tile.notes.map((note) => (
          <p key={note} className="moves-row-note">
            {note}
          </p>
        ))}
        <p className="moves-row-actions">
          <button type="button" onClick={() => onStrip(tile.key)} aria-pressed={strip}>
            {strip ? "hide strip" : "strip"}
          </button>
          <a href={soloHref(tile)}>loop this one</a>
          {tile.kind === "figure" ? <a href={`#/moves/${tile.key}/traces`}>all views →</a> : null}
        </p>
        {strip ? (
          <div className="moves-row-strip">
            <TileStrip tile={tile} zoom={zoom} step={step} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * **What the figure is**, read straight off the definition: its parts, how a
 * call becomes instances, where the shape is anchored, where it leaves people,
 * its nominal count and its timing profile.
 *
 * The role letters are lightly coloured with the role colour where a
 * figure-role names a contra role (D5, `docs/role-colours.md`) — a swing's parts
 * really are a lark's and a robin's, and an allemande's `a` and `b` are not, so
 * only the first pair gets colour and the difference is the point.
 */
function Facts({ entry }: { entry: MoveEntry }): JSX.Element {
  if (entry.def === undefined) {
    return (
      <p className="moves-row-facts" data-testid="moves-facts" data-key={entry.id}>
        <span className="moves-fact">no definition</span>
        <span className="moves-row-dim">
          in the registry and not in the library: nothing resolves a call of one
        </span>
      </p>
    );
  }
  return (
    <p className="moves-row-facts" data-testid="moves-facts" data-key={entry.id}>
      <span className="moves-fact" title="the figure's own natural count; a call's count overrides">
        {entry.nominalBeats} beats
      </span>
      <span className="moves-fact" title="how a call becomes instances">
        {entry.actors}
      </span>
      <span className="moves-fact" title="where the shape is anchored in the instance's frame">
        {entry.anchor}
      </span>
      <span className="moves-fact" title="where the figure leaves people">
        {entry.ends}
      </span>
      {entry.timing === undefined ? null : (
        <span
          className="moves-fact"
          title="whether beats scale distance or pace, and the speed curve"
        >
          {entry.timing.stretch}/{entry.timing.profile}
        </span>
      )}
      <span className="moves-fact moves-roles" title="the parts this figure has">
        {entry.roles.map((role, i) => (
          <span key={role} className="moves-role" style={roleStyle(role)}>
            {role}
            {i === entry.roles.length - 1 ? "" : " "}
          </span>
        ))}
      </span>
    </p>
  );
}

/** The role colour a figure-role's word carries, or nothing (D5). */
function roleStyle(role: string): CSSProperties | undefined {
  const which = roleColourOf(role);
  return which === undefined ? undefined : { color: ROLE_COLOURS[which] };
}

/**
 * **The parameters, shorthand beside canonical.**
 *
 * The left column is the canonical parameter the shape reads and the value it
 * takes when a call is silent — `ParamSpec`'s own `canonical` block, verbatim.
 * A parameter some dance in the record actually writes is marked, because that
 * is the difference between a word of the caller's vocabulary and a tuning
 * number nobody outside the figure has ever touched.
 */
function Params({ entry }: { entry: MoveEntry }): JSX.Element | null {
  if (entry.params.length === 0) return null;
  const written = entry.params.filter((p) => p.written);
  return (
    <details className="moves-params" data-testid="moves-params" data-key={entry.id}>
      <summary>
        parameters ({entry.params.length})
        {written.length === 0 ? "" : ` · ${String(written.length)} written by a dance`}
      </summary>
      <ul className="moves-param-list">
        {entry.params.map((p) => (
          <li
            key={p.name}
            className={p.written ? "moves-param moves-param-written" : "moves-param"}
          >
            <code>{p.name}</code> <span className="moves-row-dim">{p.text}</span>
            {p.written ? <span className="moves-param-mark"> written</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * **The parameter rows**: the same figure at another tuning, each with its own
 * deep link and its own strip.
 *
 * Text by default and a tile on demand. A hundred-odd parameter rows over the
 * whole catalogue is a hundred-odd planner runs and sampling sweeps, which is
 * what the index page cannot afford on a phone — so a row says what it is, what
 * a caller says for it and where it came from, and builds its tile when
 * somebody opens its strip or follows its link.
 *
 * A tuning that expands and cannot be drawn says so on its own row rather than
 * taking the page down with it: a hey for three is a real hey with one dancer
 * standing out, and a tile of two couples has nobody to stand out.
 */
function Variants({
  entry,
  zoom,
  step,
  engine,
}: {
  entry: MoveEntry;
  zoom: number;
  step: number;
  engine: EngineChoice;
}): JSX.Element | null {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  if (entry.variants.length === 0) return null;
  return (
    <details className="moves-variants" data-testid="moves-variants" data-key={entry.id}>
      <summary>parameter rows ({entry.variants.length})</summary>
      <ul className="moves-variant-list">
        {entry.variants.map((variant) => (
          <VariantRow
            key={variant.key}
            variant={variant}
            zoom={zoom}
            step={step}
            engine={engine}
            open={open.has(variant.key)}
            onStrip={() =>
              setOpen((was) => {
                const next = new Set(was);
                if (next.has(variant.key)) next.delete(variant.key);
                else next.add(variant.key);
                return next;
              })
            }
          />
        ))}
      </ul>
    </details>
  );
}

/** One parameter row. */
function VariantRow({
  variant,
  zoom,
  step,
  engine,
  open,
  onStrip,
}: {
  variant: MoveVariant;
  zoom: number;
  step: number;
  engine: EngineChoice;
  open: boolean;
  onStrip: () => void;
}): JSX.Element {
  const made = useMemo(
    () => (open ? variantTile(variant.id, tileVariantOf(variant), {}, engine) : undefined),
    [open, variant, engine],
  );
  return (
    <li className="moves-variant" data-testid="moves-variant" data-key={variant.key}>
      <a className="moves-variant-label" href={`#/moves/${variant.key}`}>
        {variant.label}
      </a>
      {variant.callShort === undefined ? null : (
        <span className="moves-variant-call">{variant.callShort}</span>
      )}
      <span className="moves-row-dim"> {sourceText(variant)}</span>
      <button type="button" onClick={onStrip} aria-pressed={open} className="moves-variant-strip">
        {open ? "hide strip" : "strip"}
      </button>
      {made === undefined ? null : "tile" in made ? (
        <div className="moves-row-strip">
          <TileStrip tile={made.tile} zoom={zoom} step={step} />
        </div>
      ) : (
        <p className="moves-row-note" data-testid="moves-variant-problem">
          expands, but this tile cannot draw it: {made.problem}
        </p>
      )}
    </li>
  );
}

/** Where a parameter row came from, in the words the page uses for it. */
function sourceText(variant: MoveVariant): string {
  if (variant.from === "record")
    return `· called in ${variant.dance ?? "the record"}${variant.beats === undefined ? "" : ` at ${String(variant.beats)} beats`}`;
  if (variant.from === "texts") return "· the move's texts write it their own way";
  return "· from the parameter spec";
}

/** A parameter row as the tile builder wants it. */
function tileVariantOf(variant: MoveVariant): TileVariant {
  return {
    key: variant.key,
    title: `${variant.id} · ${variant.label}`,
    params: variant.params,
    ...(variant.beats === undefined ? {} : { beats: variant.beats }),
    ...(variant.dance === undefined ? {} : { dance: variant.dance }),
    ...(variant.who === undefined ? {} : { who: variant.who }),
  };
}

/**
 * **The dance ↔ figure index for one move**: which dances call it, with which
 * parameters, in which phrase, at what count.
 *
 * The other half of the index is on each dance's own page (`#/dances/<slug>`),
 * which lists that dance's figures; this is the same fact read the other way
 * round, which is the way a caller asks it — "who uses a jersey twirl?".
 */
function DanceIndex({ entry }: { entry: MoveEntry }): JSX.Element | null {
  if (entry.dances.length === 0) {
    return (
      <p className="moves-row-note" data-testid="moves-dances" data-key={entry.id}>
        No dance in the record calls this figure yet.
      </p>
    );
  }
  return (
    <details className="moves-dances" data-testid="moves-dances" data-key={entry.id}>
      <summary>danced in ({entry.dances.length})</summary>
      <ul className="moves-dance-list">
        {entry.dances.map((use, i) => (
          <li key={i} className="moves-dance">
            <a href={`#/dances/${use.slug}`}>{use.title}</a>
            <span className="moves-row-dim">
              {" "}
              {use.phrase} &middot; {use.beats} beats
              {use.programme ? "" : " · lab"}
              {use.who === undefined ? "" : ` · who ${paramValueText(use.who)}`}
              {paramText(use.params) === "" ? "" : ` · ${paramText(use.params)}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * What one figure says, on its row: what it is, the mechanics line, the full
 * teach behind a disclosure with the ending hint under it, and the three call
 * forms with their beats.
 *
 * The AI paragraph that used to stand here is gone (W1). The user, who calls:
 * "the moves all have a lot of ai generated text description. it feels very
 * ai-generated … I can't really show this until we don't have a wall of ai text
 * in all the moves though, people will hate it." So the row opens on one
 * sentence a caller would say, and the teach is behind a disclosure for
 * whoever wants it.
 *
 * `describe` is still the fallback for a figure with no text file. Nothing in
 * the library is in that state, and the line says so plainly if one ever is.
 */
function MoveText({ call, named }: { call: GalleryCall; named: boolean }): JSX.Element {
  const label = named ? <b>{call.figure}: </b> : null;
  if (call.texts === undefined) {
    return (
      <p className="moves-row-describe">
        {label}
        {call.describe ?? "No text: this figure has no data/figures file yet."}
      </p>
    );
  }
  return (
    <div className="moves-row-text" data-testid="moves-text" data-figure={call.figure}>
      <p className="moves-row-dim" data-testid="moves-description">
        {call.texts.description}
      </p>
      <p className="moves-row-describe" data-testid="moves-walkthrough-line">
        {label}
        {call.texts.walkthrough.line}
      </p>
      <details className="moves-row-teach">
        <summary>teach</summary>
        <p data-testid="moves-walkthrough-teach">{call.texts.walkthrough.teach}</p>
        {call.hint === undefined ? null : (
          <p className="moves-row-hint" data-testid="moves-hint">
            {call.hint}
          </p>
        )}
      </details>
      <p className="moves-row-callpair" data-testid="moves-calls">
        {call.texts.forms.map((form, i) => (
          <span key={form.beats}>
            {i === 0 ? null : <span className="moves-row-dim"> &middot; </span>}
            <span className={i === 0 ? "moves-row-callshort" : undefined}>{form.text}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/** The oracle's line for one row: six numbers, the ones over a bound marked. */
export function Metrics({
  tile,
  metrics,
}: {
  tile: GalleryTile;
  metrics: TileMetric[] | undefined;
}): JSX.Element {
  if (metrics === undefined) {
    return (
      <p className="moves-row-metrics" data-testid="moves-metrics" data-key={tile.key}>
        <span className="moves-row-dim">measuring…</span>
      </p>
    );
  }
  return (
    <p className="moves-row-metrics" data-testid="moves-metrics" data-key={tile.key}>
      {metrics.map((m) => (
        <span key={m.label} className={m.over ? "moves-metric moves-over" : "moves-metric"}>
          <abbr title={m.detail}>{m.label}</abbr> {m.value}
        </span>
      ))}
      {tile.wrapped === true ? (
        <span className="moves-row-dim">
          across the wrap: these measure the tile&rsquo;s own place shift, not the figure
        </span>
      ) : null}
    </p>
  );
}

/**
 * The motion oracle's numbers for every row, measured **after** the page has
 * painted.
 *
 * A sweep at 1/32 beat costs about 9 ms a tile, which is half a second over the
 * whole gallery — cheap enough to do for every row and far too much to do in
 * front of the first paint on a phone. So the rows render with `measuring…` in
 * the slot and fill in on the next tick; `data-measured` on the control bar is
 * how a screenshot waits for them. The bare and strip routes never measure:
 * they draw one canvas for a camera.
 */
function useMetrics(
  tiles: readonly GalleryTile[],
  bare: boolean,
): ReadonlyMap<string, TileMetric[]> | null {
  const [measured, setMeasured] = useState<ReadonlyMap<string, TileMetric[]> | null>(null);
  useEffect(() => {
    if (bare) return;
    let live = true;
    const id = requestAnimationFrame(() => {
      if (!live) return;
      setMeasured(new Map(tiles.map((tile) => [tile.key, tileMetrics(tile)])));
    });
    return () => {
      live = false;
      cancelAnimationFrame(id);
    };
  }, [tiles, bare]);
  return measured;
}

/** The looping canvas of one tile. Exported for the seam lab, which loops two. */
export function TileCanvas({
  tile,
  beat,
  zoom,
  trails,
  always = false,
}: {
  tile: GalleryTile;
  beat: Beat;
  zoom: number;
  trails: boolean;
  /** Draw even when the tile is off screen: the bare screenshot route. */
  always?: boolean;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const previousRef = useRef<{ beat: Beat; at: Map<DancerId, Vec2> } | undefined>(undefined);
  const people = useMemo(() => peopleOf(tile.group), [tile]);
  const onScreen = useOnScreen(canvasRef, always);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const renderer = createRenderer(canvas, { world: { ...tile.world, zoom }, skirts: false });
    paintFloor(renderer);
    rendererRef.current = renderer;
    previousRef.current = undefined;
    return () => {
      rendererRef.current = null;
    };
  }, [tile, zoom]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null || !onScreen) return;
    const local = localBeat(tile, beat);
    const previous = previousRef.current;
    // The loop wrapping is a jump, not motion: drop the trails and the velocity
    // rather than drawing a streak across the tile.
    if (previous !== undefined && local < previous.beat) {
      renderer.clearTrails();
      previousRef.current = undefined;
    }
    const drawn = hallFrame(tile.timeline, people, local, {
      trails,
      previous: previousRef.current,
    });
    renderer.render(drawn.frame);
    previousRef.current = { beat: local, at: drawn.at };
    canvasRef.current?.setAttribute("data-ready", "1");
  }, [tile, beat, zoom, trails, people, onScreen]);

  useEffect(() => {
    rendererRef.current?.clearTrails();
  }, [trails]);

  return (
    <canvas ref={canvasRef} data-testid="moves-canvas" data-key={tile.key} className="block" />
  );
}

/** One frame per `step` beats, the beat drawn under each in the hall's font. */
function TileStrip({
  tile,
  zoom,
  step,
}: {
  tile: GalleryTile;
  zoom: number;
  step: number;
}): JSX.Element {
  const people = useMemo(() => peopleOf(tile.group), [tile]);
  const cells = stripCells(tile, step);

  return (
    <div
      className="flex w-fit flex-none gap-1 bg-[#0c0a09] p-2"
      data-testid="moves-strip"
      data-key={tile.key}
      data-cells={cells.length}
    >
      {cells.map((cell) => (
        <StripCell key={cell.label} tile={tile} cell={cell} zoom={zoom} people={people} />
      ))}
    </div>
  );
}

/** Which frames a strip draws: the whole figure, or the beats either side of a seam. */
export function stripCells(tile: GalleryTile, step: number): Array<{ at: Beat; label: string }> {
  const { start, beats } = tile.window;
  const from = tile.seamAt === undefined ? 0 : Math.max(0, tile.seamAt - SEAM_STRIP_BEATS);
  const to = tile.seamAt === undefined ? beats : Math.min(beats, tile.seamAt + SEAM_STRIP_BEATS);
  const span = to - from;
  const used = Math.max(step, span / MAX_STRIP_CELLS);
  const cells: Array<{ at: Beat; label: string }> = [];
  for (let t = from; t < to - 1e-9; t += used) {
    const relative = tile.seamAt === undefined ? t : t - tile.seamAt;
    cells.push({ at: start + t, label: beatText(relative) });
  }
  return cells;
}

/** One frame of a strip: the tile at `cell.at`, with its beat drawn under it. */
export function StripCell({
  tile,
  cell,
  zoom,
  people,
}: {
  tile: GalleryTile;
  cell: { at: Beat; label: string };
  zoom: number;
  people: Map<DancerId, Person>;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    delete canvas.dataset["ready"];
    const renderer = createRenderer(canvas, { world: { ...tile.world, zoom }, skirts: false });
    paintFloor(renderer, cell.label);
    renderer.render(hallFrame(tile.timeline, people, cell.at, { trails: false }).frame);
    canvas.dataset["ready"] = "1";
  }, [tile, cell.at, cell.label, zoom, people]);

  return <canvas ref={canvasRef} className="block flex-none" />;
}

/**
 * The people of a gallery group: one per station, seeded off the **station**.
 *
 * Not off the dancer id, which is what the hall does. A tile is a picture of a
 * figure rather than of an evening: the same move in the same station should
 * look the same whoever the set that produced the timeline happens to have put
 * there, and since M3 that is a real hall dancer (`set0/c0/lark`) rather than a
 * name this page made up. Seeding off the station keeps every tile's four
 * dancers exactly the four they have always been, so a strip that changed
 * changed because the *dancing* changed.
 */
export function peopleOf(group: Group): Map<DancerId, Person> {
  const people = new Map<DancerId, Person>();
  for (const station of group.stations) {
    const id = group.members[station.id];
    if (id === undefined) continue;
    people.set(
      id,
      createPerson({
        id,
        role: station.role,
        seed: seedOf(`gallery/${station.id}`),
        // The ones travel down and get the darker trail, as in the hall.
        ones: station.id.startsWith("1"),
        roleShirts: true,
      }),
    );
  }
  return people;
}

/** A plain floor, and the beat number under it in the hall's own bitmap font. */
function paintFloor(renderer: Renderer, label?: string): void {
  const g = renderer.layers.floor.getContext("2d");
  if (g === null) return;
  g.fillStyle = FLOOR_COLOUR;
  g.fillRect(0, 0, renderer.world.w, renderer.world.h);
  if (label !== undefined) drawText(g, FONT, label, 2, renderer.world.h - GLYPH_H - 2, STRIP_INK);
}

/** Where on a tile's own timeline a page beat falls: its window, looped. */
export function localBeat(tile: GalleryTile, beat: Beat): Beat {
  const { start, beats } = tile.window;
  return start + (((beat % beats) + beats) % beats);
}

/**
 * `""`, `"balance"`, `"hey~amount=0.5"` or `"balance--swing"` from what follows
 * `#/moves`.
 */
export function soloKey(path: string): string | null {
  const rest = path.replace(/^\/+/, "");
  if (rest === "") return null;
  if (rest.startsWith("seam/")) return rest.slice("seam/".length);
  return rest;
}

/**
 * The one tile a deep link asks for: a definition's, a seam's, or a **parameter
 * row's**, which is built on the spot because the index never built it.
 */
export function soloTile(
  key: string,
  tiles: readonly GalleryTile[],
  catalogue: readonly MoveFamily[],
  engine: EngineChoice,
): { tile?: GalleryTile; problem?: string } {
  const held = tiles.find((t) => t.key === key);
  if (held !== undefined) return { tile: held };
  for (const family of catalogue) {
    for (const entry of family.moves) {
      const variant = entry.variants.find((v) => v.key === key);
      if (variant === undefined) continue;
      const made = variantTile(variant.id, tileVariantOf(variant), {}, engine);
      return "tile" in made ? { tile: made.tile } : { problem: made.problem };
    }
  }
  return {};
}

/** The deep link that opens one tile on its own. */
export const soloHref = (tile: GalleryTile): string =>
  tile.kind === "seam" ? `#/moves/seam/${tile.key}` : `#/moves/${tile.key}`;

/** The catalogue entry for a figure id, wherever in the families it is filed. */
function entryFor(catalogue: readonly MoveFamily[], id: string): MoveEntry | undefined {
  for (const family of catalogue) {
    const found = family.moves.find((entry) => entry.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Build the tiles once for the life of the page: they cost a sampling sweep. */
function useTiles(engine: EngineChoice): GalleryTile[] {
  return useMemo(() => galleryTiles({}, engine), [engine]);
}

/** The catalogue is pure and plans nothing, but it still reads every dance file. */
function useCatalogue(): MoveFamily[] {
  return useMemo(() => moveCatalogue(), []);
}

/**
 * Whether an element is on screen, so fifty-odd tiles do not all redraw every
 * animation frame on a phone. `always` is the bare screenshot route, which has
 * one tile and must draw whether the viewport says so or not.
 */
function useOnScreen(ref: React.RefObject<Element | null>, always: boolean): boolean {
  const [seen, setSeen] = useState(always);
  useEffect(() => {
    if (always) return;
    const el = ref.current;
    if (el === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setSeen(entries.some((e) => e.isIntersecting)),
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, always]);
  return seen;
}

function zoomFrom(raw: string | null, solo: boolean): number {
  const n = Number(raw);
  if (GALLERY_ZOOMS.some((z) => z === n)) return n;
  return solo ? SOLO_ZOOM : DEFAULT_ZOOM;
}

function speedFrom(raw: string | null): number {
  const n = Number(raw);
  return SPEEDS.some((s) => s === n) ? n : 1;
}

const speedText = (s: number): string => (s === 0.25 ? "¼×" : s === 0.5 ? "½×" : "1×");

/**
 * A beat as the strip labels it: no trailing zero, and a bare minus for the
 * beats before a seam. The rounding matters — a seam cell lands on the seam
 * through a float sum, and `(-1e-15).toFixed(1)` is the string `"-0.0"`.
 */
export function beatText(beat: Beat): string {
  const rounded = Math.round(beat * 10) / 10;
  const text = (rounded === 0 ? 0 : rounded).toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

export { paramText } from "../moveParams.js";
