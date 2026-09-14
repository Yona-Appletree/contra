import { DEMO_DANCES } from "@caller/contra";
import { Card } from "@caller/music";
import type { JSX } from "react";

/**
 * The Dances tab: one card per encoded dance, scrollable on a phone.
 *
 * The card itself is `@caller/music`'s — the same component the Stage tab puts
 * beside the hall — read at beat 0, so a card here is the dance as written
 * rather than the dance as danced. Tapping one goes to `#/dance/<slug>`, which
 * is the Stage tab already playing it.
 */
export function DancesPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">Dances</h1>
        <p className="text-sm text-muted-foreground">
          The evening&rsquo;s programme. Tap a card to dance it on the stage.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_DANCES.map((dance) => (
          <a
            key={dance.slug}
            href={`#/dance/${dance.slug}`}
            data-testid="dance-card"
            data-slug={dance.slug}
            className="flex flex-col gap-2 rounded-lg border p-3 no-underline hover:border-current"
          >
            <Card dance={dance} beat={0} />
            <p className="text-xs text-muted-foreground">
              {dance.author} &middot; {dance.formation}
            </p>
          </a>
        ))}
      </div>
    </main>
  );
}
