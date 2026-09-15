import type { JSX } from "react";

/** One spike: its slug (the directory under `spikes/` and `dist/spikes/`), name, date and one-line ruling. */
interface SpikeEntry {
  slug: string;
  name: string;
  date: string;
  ruling: string;
}

/**
 * The repo's visual spikes, each served at `${base}spikes/<slug>/` by the
 * build (`copy-spikes.mjs`) and linked from this page. This is a small
 * constant, not a directory listing — production code never reads
 * `spikes/` (`AGENTS.md`, `check:deps`) — so a new spike gets an entry here
 * by hand. Each ruling line is copied from that spike's own header hint.
 */
const SPIKES: SpikeEntry[] = [
  {
    slug: "hall",
    name: "Hands Four · the hall",
    date: "2026-09-13",
    ruling:
      "Proof of concept passes: the hall reads as a dance. Top-down over front-drawn is the direction.",
  },
  {
    slug: "two-dancers",
    name: "Hands Four · two dancers",
    date: "2026-09-13",
    ruling:
      "Passes, move on to the plan: arms as fixed-length 3D bones, joined hands stack robin on top.",
  },
  {
    slug: "move-motion",
    name: "Move motion · the beat in a walk",
    date: "2026-09-14",
    ruling:
      "The body walks on the cruise; feet are the planted gait, right foot first, on count 1.",
  },
];

/**
 * `#/spikes`: a hidden route (no tab, reachable by URL and the footer)
 * listing the repo's visual spikes — the record every gate was judged on,
 * kept out of production code but served at `/spikes/` on the deployed site
 * so any one of them can be shared by a plain link.
 *
 * DD7 (M10 P5): the footer used to carry one link per spike; as their number
 * grew past two that started to crowd out the footer's own doors (the pair
 * page, the licence), so the footer now carries a single "Spikes" link here
 * and this page carries the rest, in the dance page's own typography (U3).
 */
export function SpikesPage(): JSX.Element {
  const base = import.meta.env.BASE_URL;
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4">
      <div className="dance-page" data-testid="spikes-page">
        <header className="dance-page-head flex flex-col gap-0.5">
          <h1>Spikes</h1>
          <p>
            Self-contained visual playgrounds, kept in the repo as the record of what a gate was
            judged on. Never imported by the app itself.
          </p>
        </header>

        <ol className="dance-page-walkthrough" data-testid="spikes-list">
          {SPIKES.map((spike) => (
            <li key={spike.slug} className="dance-page-step">
              <p className="dance-page-step-head">
                {spike.name} &middot; {spike.date}
              </p>
              <p>{spike.ruling}</p>
              <a
                href={`${base}spikes/${spike.slug}/`}
                data-testid="spike-link"
                data-slug={spike.slug}
                className="text-xs text-muted-foreground"
              >
                open the spike &rarr;
              </a>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
