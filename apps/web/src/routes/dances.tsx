import type { Dance } from "@caller/choreo";
import type { ResolutionRow } from "@caller/contra";
import { DEMO_DANCES, danceBySlug, danceResolution, labCouples } from "@caller/contra";
import { Card } from "@caller/music";
import type { JSX } from "react";
import { useMemo } from "react";
import { cardDance } from "../danceCard.js";
import { danceWalkthrough } from "../danceWalkthrough.js";
import { formationSummary } from "../formationSummary.js";
import { isLabDance } from "../program.js";
import { DanceTraces } from "../traces/DanceTraces.js";

/**
 * The Dances tab: one card per encoded dance, scrollable on a phone.
 *
 * The card itself is `@caller/music`'s — the same component the Stage tab puts
 * beside the hall — read at beat 0, so a card here is the dance as written
 * rather than the dance as danced. Tapping one goes to `#/dance/<slug>`, which
 * is the Stage tab already playing it (the user's own earlier ruling).
 *
 * U3 took T2's inline traces back off every card — "ten dances of diagrams was
 * the same noise" — and gave each card a small link to its own dance page
 * instead, where the shapes, the calling card and the walkthrough all live now.
 */
export function DancesPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4">
      <p className="text-sm text-muted-foreground">
        The evening&rsquo;s programme. Tap a card to dance it on the stage, or open a dance&rsquo;s
        own page for its card and shapes.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_DANCES.map((dance) => (
          <div key={dance.slug} className="flex flex-col gap-1">
            <a
              href={`#/dance/${dance.slug}`}
              data-testid="dance-card"
              data-slug={dance.slug}
              className="block no-underline"
            >
              {/*
               * The card carries its own frame now (U1: it is a note card), so
               * the link is a bare wrapper rather than a second box around it.
               * The formation goes on the card, under the phrases, where the
               * Stage tab puts the tune.
               */}
              <Card dance={cardDance(dance)} beat={0}>
                <span className="caller-music-card-caption">{dance.formation}</span>
              </Card>
            </a>
            <a
              href={`#/dances/${dance.slug}`}
              data-testid="dance-page-link"
              data-slug={dance.slug}
              className="self-end text-xs text-muted-foreground"
            >
              card and shapes &rarr;
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}

/**
 * `#/dances/<slug>`: one dance's own quiet reference sheet, phone-first (U3).
 *
 * The user, looking at the front page on a phone: "where did those diagrams
 * come from on the front-page? … I think they go on the dance page, which
 * should be linked from the main page." This is that page: the head, the
 * static calling card, the shapes (T2's traces, with T4's plot/march/seismo
 * switch and T6's along-hall wrap — `?view=` and `?wrap=0` both reach
 * `DanceTraces` through this page's own `params`), and — where the text layer
 * makes it cheap — the walkthrough, the dance's own figures in order with the
 * long teach each resolves to (W1's `resolveFigureText`, `landmark()` filling
 * `{where}` from `ends()`). "Play on the Stage" links to the Stage's own
 * singular route, top and bottom.
 */
export function DancePage({
  slug,
  params,
}: {
  slug: string;
  params: URLSearchParams;
}): JSX.Element {
  const dance = danceBySlug(slug);

  if (dance === undefined) {
    return (
      <main className="p-6">
        <p data-testid="dance-page-missing">
          No dance called <code>{slug}</code>. <a href="#/dances">Back to the programme</a>.
        </p>
      </main>
    );
  }

  const walkthrough = danceWalkthrough(dance);
  const playHref = `#/dance/${dance.slug}`;

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4"
      data-testid="dance-page"
      data-slug={dance.slug}
    >
      <a href={playHref} data-testid="dance-page-play-top" className="text-sm">
        Play {dance.title} on the Stage &rarr;
      </a>

      <div className="dance-page">
        <header className="dance-page-head flex flex-col gap-0.5">
          <h1>
            {dance.title}
            {/*
             * A lab dance (`DanceFile.status: "lab"`, M1) loads, dances and has
             * this page, and is deliberately not in the programme — so it has
             * no card on the Dances tab and the evening never shows a dance
             * that does not dance. Saying so here is how somebody who followed
             * a link finds out which kind of dance they are looking at.
             */}
            {isLabDance(dance.slug) ? (
              <span className="dance-page-lab" data-testid="dance-page-lab">
                lab
              </span>
            ) : null}
          </h1>
          {dance.author === undefined ? null : <p>{dance.author}</p>}
          <p>{formationSummary(dance)}</p>
          {dance.notes === undefined ? null : <p>{dance.notes}</p>}
        </header>

        {/* The calling card: the same `Card` the Stage uses, static — beat 0,
            no live call. */}
        <div data-testid="dance-page-card">
          <Card dance={cardDance(dance)} beat={0} />
        </div>

        <section className="flex flex-col gap-1" data-testid="dance-page-shapes">
          <h2 className="text-sm font-semibold">The shapes</h2>
          <DanceTraces dance={dance} params={params} />
          <a
            href={`#/dances/${dance.slug}/traces`}
            data-testid="dance-traces-link"
            data-slug={dance.slug}
            className="self-start text-xs text-muted-foreground"
          >
            all views, full width &rarr;
          </a>
        </section>

        {/*
         * The walkthrough (U3's addendum, the vision's first "walkthrough
         * card"): the dance's own figures in order, each with its long teach.
         * Left out — never a placeholder — for a dance where some call's
         * texts do not resolve, which `danceWalkthrough` already drops
         * silently; none of the ten demo dances does.
         */}
        {walkthrough.length === 0 ? null : (
          <section className="flex flex-col gap-1" data-testid="dance-page-walkthrough-section">
            <h2 className="text-sm font-semibold">The walkthrough</h2>
            <ol className="dance-page-walkthrough" data-testid="dance-page-walkthrough">
              {walkthrough.map((step, i) => (
                <li key={i} className="dance-page-step">
                  <p className="dance-page-step-head">
                    {step.phrase} &middot; {step.call}
                  </p>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <Resolution dance={dance} />
      </div>

      <a href={playHref} data-testid="dance-page-play-bottom" className="text-sm">
        Play {dance.title} on the Stage &rarr;
      </a>
    </main>
  );
}

/**
 * **How this dance resolves**: what each call becomes on the new engine.
 *
 * One row per figure instance the contra planner produces for one time through
 * of one set — the figure, the group instance, which dancer plays which
 * figure-role, the definition's anchor and ends rules, the hands carried in
 * and out across each boundary, and anybody the call left standing.
 *
 * Read off `danceResolution`, which runs the planner for real and reads the
 * timeline it produced, so this is what actually happened rather than what a
 * parallel code path thinks would. It is the same table `pnpm dance <slug>`
 * prints, which is the point: the translator's loop and the page agree because
 * they are one function.
 *
 * A dance that does not resolve says so rather than showing nothing: that is
 * the state a half-encoded lab dance is in, and this page is where somebody
 * would be looking at it.
 */
function Resolution({ dance }: { dance: Dance }): JSX.Element {
  const couples = labCouples(dance);
  const resolved = useMemo<{ rows: ResolutionRow[]; error?: string }>(() => {
    try {
      return { rows: danceResolution(dance, couples) };
    } catch (error) {
      return { rows: [], error: String(error) };
    }
  }, [dance, couples]);

  return (
    <section className="flex flex-col gap-1" data-testid="dance-page-resolution-section">
      <h2 className="text-sm font-semibold">How it resolves</h2>
      <p className="text-xs text-muted-foreground">
        Every figure instance the planner makes of this dance, one time through, at{" "}
        {String(couples)} couples &mdash; the same table <code>pnpm dance {dance.slug}</code>{" "}
        prints.
      </p>
      {resolved.error === undefined ? null : (
        <p className="text-xs" data-testid="dance-page-resolution-error">
          This dance does not resolve: <code>{resolved.error}</code>
        </p>
      )}
      <ol className="dance-page-resolution" data-testid="dance-page-resolution">
        {resolved.rows.map((row, i) => (
          <li key={i} className="dance-page-resolution-row" data-figure={row.figure}>
            <p className="dance-page-resolution-head">
              <span className="dance-page-resolution-beat">
                {row.phrase} &middot; beat {String(row.start)}+{String(row.beats)}
              </span>{" "}
              <code>{row.figure}</code> in <code>{row.group}</code>
            </p>
            <p className="dance-page-resolution-detail">
              cast{" "}
              {Object.entries(row.cast)
                .map(([role, dancer]) => `${role}=${shortDancer(dancer)}`)
                .join(" ")}{" "}
              &middot; anchor <code>{row.anchor}</code> &middot; ends <code>{row.ends}</code>
            </p>
            {row.carriedIn.length === 0 ? null : (
              <p className="dance-page-resolution-detail">carried in: {row.carriedIn.join(", ")}</p>
            )}
            {row.carriedOut.length === 0 ? null : (
              <p className="dance-page-resolution-detail">
                carried out: {row.carriedOut.join(", ")}
              </p>
            )}
            {row.holdPlace.length === 0 ? null : (
              <p className="dance-page-resolution-detail">
                hold place: {row.holdPlace.map(shortDancer).join(", ")}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** `set0/c1/lark` as `c1/lark`: the set is the same one for every row here. */
const shortDancer = (dancer: string): string => dancer.replace(/^[^/]+\//, "");
