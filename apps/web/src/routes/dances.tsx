import { DEMO_DANCES, danceBySlug } from "@caller/contra";
import { Card } from "@caller/music";
import type { JSX } from "react";
import { cardDance } from "../danceCard.js";
import { danceWalkthrough } from "../danceWalkthrough.js";
import { formationSummary } from "../formationSummary.js";
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
          <h1>{dance.title}</h1>
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
      </div>

      <a href={playHref} data-testid="dance-page-play-bottom" className="text-sm">
        Play {dance.title} on the Stage &rarr;
      </a>
    </main>
  );
}
