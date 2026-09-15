import { DEMO_DANCES, danceBySlug } from "@caller/contra";
import { ROLE_COLOURS, penColour } from "@caller/hall";
import type { JSX } from "react";
import { useMemo } from "react";
import type { GalleryTile } from "../galleryTiles.js";
import { galleryTiles, groupedTiles, tileByKey } from "../galleryTiles.js";
import { TraceSvg } from "../traces/TraceSvg.js";
import { danceTrace } from "../traces/danceTrace.js";
import { figureTrace } from "../traces/figureTrace.js";
import { facingFromQuery, traceDrawings } from "../traces/traceDrawings.js";
import { soloHref } from "./moves.js";

/**
 * `#/dances/<slug>/traces`: one dance, all four views, at full width.
 *
 * The four are the exploration post's four, redrawn from the engine — pen plot,
 * march, seismograph, figure strip — and each carries the sentence that says
 * how to read it, because a plate nobody can read is a decoration.
 *
 * `?facing=wake` or `?facing=arrowheads` swaps the pen plot's and the march's
 * facing style away from the shipped default (ticks) — T3's live comparison.
 */
export function TracesPage({
  slug,
  params,
}: {
  slug: string;
  params: URLSearchParams;
}): JSX.Element {
  const dance = danceBySlug(slug);
  const facing = facingFromQuery(params.get("facing"));
  const drawings = useMemo(
    () => (dance === undefined ? null : traceDrawings(danceTrace(dance), undefined, facing)),
    [dance, facing],
  );

  if (dance === undefined || drawings === null) {
    return (
      <main className="p-6">
        <p data-testid="traces-missing">
          No dance called <code>{slug}</code>. <a href="#/dances">Back to the programme</a>.
        </p>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-3 lg:p-4"
      data-testid="traces-page"
      data-slug={dance.slug}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{dance.title}</h1>
        <p className="text-sm text-muted-foreground">
          {dance.author} &middot; {dance.formation} &middot; one time through, one minor set, drawn
          from the simulation. <a href={`#/dance/${dance.slug}`}>Dance it on the stage</a> &middot;{" "}
          <a href="#/dances">back to the programme</a>.
        </p>
        <Legend />
      </header>

      {VIEWS.map((view) => (
        <section
          key={view.kind}
          className="flex flex-col gap-1"
          data-testid={`traces-${view.kind}`}
        >
          <h2 className="text-lg font-semibold">{view.title}</h2>
          <p className="max-w-[80ch] text-sm text-muted-foreground">{view.how}</p>
          <TraceSvg
            svg={drawings[view.kind]}
            kind={view.kind}
            label={`${dance.title}: ${view.title}`}
          />
        </section>
      ))}

      <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {DEMO_DANCES.map((other) => (
          <a
            key={other.slug}
            href={`#/dances/${other.slug}/traces`}
            aria-current={other.slug === dance.slug ? "page" : undefined}
            className={other.slug === dance.slug ? "font-semibold" : "text-muted-foreground"}
          >
            {other.title}
          </a>
        ))}
      </nav>
    </main>
  );
}

/**
 * `#/moves/<figure-id>/traces`: one figure, all four views, at full width —
 * the Moves tab's mirror of `#/dances/<slug>/traces` (T4).
 *
 * Only a figure has one. A seam's own row already carries the two figures on
 * either side of it and the beats either side are what its strip already
 * shows; the reading this page adds is for the whole shape one figure makes,
 * which is a figure's question, not a seam's. `id` naming a seam, or nothing
 * in the registry, falls to the "no such move" branch below.
 *
 * `?facing=wake` or `?facing=arrowheads` swaps the pen plot's and the march's
 * facing style, exactly as it does on `#/dances/<slug>/traces`.
 */
export function MoveTracesPage({
  id,
  params,
}: {
  id: string;
  params: URLSearchParams;
}): JSX.Element {
  const tiles = useMemo(() => galleryTiles(), []);
  const tile = tileByKey(tiles, id);
  const seams = useMemo(
    () => groupedTiles(tiles).find((g) => g.figure.key === id)?.seams ?? [],
    [tiles, id],
  );
  const facing = facingFromQuery(params.get("facing"));
  const drawings = useMemo(
    () =>
      tile === undefined || tile.kind !== "figure"
        ? null
        : traceDrawings(figureTrace(tile), undefined, facing),
    [tile, facing],
  );

  if (tile === undefined || tile.kind !== "figure" || drawings === null) {
    return (
      <main className="p-6">
        <p data-testid="move-traces-missing">
          No figure called <code>{id}</code>. <a href="#/moves">Back to the gallery</a>.
        </p>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-3 lg:p-4"
      data-testid="move-traces-page"
      data-key={tile.key}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{tile.title}</h1>
        <p className="text-sm text-muted-foreground">
          {tile.formation}
          {tile.source === undefined ? " · figure defaults" : ` · from ${tile.source}`} &middot; one
          time through the tile&rsquo;s own looping window, drawn from the simulation.{" "}
          <a href={soloHref(tile)}>Loop it on the Moves tab</a> &middot;{" "}
          <a href="#/moves">back to the gallery</a>.
        </p>
        <Legend />
      </header>

      {tile.calls.map((call) => (
        <p key={call.figure} className="max-w-[80ch] text-sm" data-testid="move-traces-describe">
          {call.describe ?? "No description: this figure has no `describe` yet."}
        </p>
      ))}

      {VIEWS.map((view) => (
        <section
          key={view.kind}
          className="flex flex-col gap-1"
          data-testid={`move-traces-${view.kind}`}
        >
          <h2 className="text-lg font-semibold">{view.title}</h2>
          <p className="max-w-[80ch] text-sm text-muted-foreground">{view.how}</p>
          <TraceSvg
            svg={drawings[view.kind]}
            kind={view.kind}
            label={`${tile.title}: ${view.title}`}
          />
        </section>
      ))}

      <SeamLinks seams={seams} />
    </main>
  );
}

/** The figure's own seams, each linking back to that seam's row on the Moves tab. */
function SeamLinks({ seams }: { seams: readonly GalleryTile[] }): JSX.Element | null {
  if (seams.length === 0) return null;
  return (
    <nav
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
      data-testid="move-traces-seams"
    >
      <span className="text-muted-foreground">Its seams, on the Moves tab:</span>
      {seams.map((seam) => (
        <a key={seam.key} href={soloHref(seam)}>
          {seam.title}
        </a>
      ))}
    </nav>
  );
}

/** The four views, in the order the post put them, with how to read each. */
const VIEWS = [
  {
    kind: "pen" as const,
    title: "Pen plot",
    how: "The whole time through on the set, each dancer a pen. The band's rail is the bar across the top and the faint box is where the four started. A tick on every beat points the way that dancer was facing, which is what tells a forward pass from a backward one.",
  },
  {
    kind: "march" as const,
    title: "March",
    how: "The same pens with the set sliding right as the beats pass. Loops are turns, flat stretches are standing still, and the phrase rules are A1, A2, B1, B2.",
  },
  {
    kind: "seismograph" as const,
    title: "Seismograph",
    how: "Each dancer's place across the set, then along it, against time. Crossings in the top lane are passes across the set; the drift in the bottom lane is the progression.",
  },
  {
    kind: "strip" as const,
    title: "Figure strip",
    how: "One small plot per call, the cell as wide as the call is long, the figure underneath. Same figure, same colour — a dance that repeats one says so twice in the same paint.",
  },
];

/** Who is who: the two role colours and the two ranks, as swatches. */
function Legend(): JSX.Element {
  const pens = [
    { label: "one lark", colour: penColour("lark", 1) },
    { label: "two lark", colour: penColour("lark", 2) },
    { label: "one robin", colour: penColour("robin", 1) },
    { label: "two robin", colour: penColour("robin", 2) },
  ];
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="traces-legend">
      {pens.map((pen) => (
        <span key={pen.label} className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-0.5 w-6 rounded"
            style={{ background: pen.colour }}
          />
          {pen.label}
        </span>
      ))}
      <span className="text-muted-foreground">
        larks {ROLE_COLOURS.lark}, robins {ROLE_COLOURS.robin}; the ones darker
      </span>
    </p>
  );
}
