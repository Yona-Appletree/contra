import { DEMO_DANCES, danceBySlug } from "@caller/contra";
import { ROLE_COLOURS, penColour } from "@caller/hall";
import type { JSX } from "react";
import { useMemo } from "react";
import { TraceSvg } from "../traces/TraceSvg.js";
import { danceTrace } from "../traces/danceTrace.js";
import { facingFromQuery, traceDrawings } from "../traces/traceDrawings.js";

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
