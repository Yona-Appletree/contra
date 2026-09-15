import { DEMO_DANCES } from "@caller/contra";
import { Card } from "@caller/music";
import type { JSX } from "react";
import { cardDance } from "../danceCard.js";
import { DanceTraces } from "../traces/DanceTraces.js";

/**
 * The Dances tab: one card per encoded dance, scrollable on a phone.
 *
 * The card itself is `@caller/music`'s — the same component the Stage tab puts
 * beside the hall — read at beat 0, so a card here is the dance as written
 * rather than the dance as danced. Tapping one goes to `#/dance/<slug>`, which
 * is the Stage tab already playing it.
 *
 * Under the phrases, T2 added the dance's own traces: one time through as a
 * figure strip and as a pen plot on the set, drawn from the engine. The link to
 * all four views sits outside the card, because a link inside a link is not
 * markup.
 */
export function DancesPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4">
      <p className="text-sm text-muted-foreground">
        The evening&rsquo;s programme. Tap a card to dance it on the stage, or open a dance&rsquo;s
        traces to read all four views at full width.
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
                <DanceTraces dance={dance} />
              </Card>
            </a>
            <a
              href={`#/dances/${dance.slug}/traces`}
              data-testid="dance-traces-link"
              data-slug={dance.slug}
              className="self-end text-xs text-muted-foreground"
            >
              all four views &rarr;
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
