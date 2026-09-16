import type { JSX } from "react";
import { useEffect, useState } from "react";
import { BuildInfoBadge } from "./buildInfo/BuildInfoBadge.js";
import { DanceLabPage, danceLabSlug } from "./routes/danceLab.js";
import { DancePage, DancesPage } from "./routes/dances.js";
import { FramePage } from "./routes/frame.js";
import { HallPage } from "./routes/hall.js";
import { hashRoute } from "./routes/hashRoute.js";
import { SeamLabPage } from "./routes/lab.js";
import { MovesPage } from "./routes/moves.js";
import { PairPage } from "./routes/pair.js";
import { SpikesPage } from "./routes/spikes.js";
import { MoveTracesPage, TracesPage } from "./routes/traces.js";
import { TunePage, TunesPage } from "./routes/tunes.js";
import { readHallRoute } from "./state/hallUrl.js";

export function App() {
  const [route, setRoute] = useState(() => hashRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(hashRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Hidden: the single-frame route the golden and perf tests screenshot. No
  // tab bar — the goldens screenshot the page, not just the canvas.
  if (route.path === "/frame") {
    return <FramePage params={route.params} />;
  }

  // The pair page, gate G1's artifact, moved off the front page by M9. Hidden
  // from the tabs, still linkable.
  if (route.path === "/pair") {
    // Keyed on the query, so navigating between `#/pair?...` URLs starts the
    // page again rather than keeping the previous zoom, beat and strip.
    return <PairPage key={route.params.toString()} params={route.params} />;
  }

  // `#/spikes` (M10 P5, DD7): the repo's visual spikes, one link each. Hidden
  // from the tabs, reachable from the footer and by URL, like `/pair` above.
  if (route.path === "/spikes") {
    return <SpikesPage />;
  }

  // `?bare=1` is for screenshots: one canvas, no chrome, so no tab bar either.
  const bare = route.params.get("bare") === "1";

  // `#/moves/<figure-id>/traces`: one figure, all four views, at full width —
  // the Moves tab's mirror of `#/dances/<slug>/traces` below. Checked before
  // the general `/moves` route, since that one matches every `/moves/...`
  // path too.
  const moveTraces = moveTracesId(route.path);
  if (moveTraces !== undefined) {
    const page = (
      <MoveTracesPage
        key={`${moveTraces}|${route.params.toString()}`}
        id={moveTraces}
        params={route.params}
      />
    );
    return bare ? page : <Tabbed tab="moves">{page}</Tabbed>;
  }

  // `#/lab/dance` and `#/lab/dance/<slug>`: the **dance lab** (M9h) — one
  // dance, its record and the candidate readings of where it carries its
  // progression, side by side over a whole time through. Checked before the
  // seam lab below, which matches every other `/lab/...` path.
  const labDance = danceLabSlug(route.path);
  if (labDance !== null) {
    const page = (
      <DanceLabPage
        key={`${route.path}|${route.params.toString()}`}
        path={route.path}
        params={route.params}
      />
    );
    return bare ? page : <Tabbed tab="moves">{page}</Tabbed>;
  }

  // `#/lab` and `#/lab/seam/<a>--<b>`: the seam lab (M3, gate G1) — one seam
  // danced through both engines at once. Filed under the Moves tab, because a
  // seam is a move's edge, but a route of its own: it ignores most of the
  // Moves page's controls and has four of its own.
  if (route.path === "/lab" || route.path.startsWith("/lab/")) {
    const page = (
      <SeamLabPage
        key={`${route.path}|${route.params.toString()}`}
        path={route.path}
        params={route.params}
      />
    );
    return bare ? page : <Tabbed tab="moves">{page}</Tabbed>;
  }

  if (route.path === "/moves" || route.path.startsWith("/moves/")) {
    const page = (
      <MovesPage
        key={`${route.path}|${route.params.toString()}`}
        path={route.path.slice("/moves".length)}
        params={route.params}
      />
    );
    return bare ? page : <Tabbed tab="moves">{page}</Tabbed>;
  }

  // `#/dances/<slug>/traces`: one dance, all four views, at full width. Note
  // the plural — the Stage's own dance URL is `#/dance/<slug>`, singular, and
  // `readHallRoute` below only ever reads that one.
  const traces = tracesSlug(route.path);
  if (traces !== undefined) {
    const page = (
      <TracesPage
        key={`${traces}|${route.params.toString()}`}
        slug={traces}
        params={route.params}
      />
    );
    return bare ? page : <Tabbed tab="dances">{page}</Tabbed>;
  }

  // `#/dances/<slug>`: one dance's own quiet reference page — plural, the
  // slug alone, distinct from both `#/dance/<slug>` (singular, the Stage) and
  // `#/dances/<slug>/traces` (three segments, checked above this one).
  // Mirrors `/moves/<id>` the same way `moveTracesId` mirrors `tracesSlug`.
  const dance = danceSlug(route.path);
  if (dance !== undefined) {
    const page = <DancePage key={dance} slug={dance} params={route.params} />;
    return bare ? page : <Tabbed tab="dances">{page}</Tabbed>;
  }

  if (route.path === "/dances") {
    return (
      <Tabbed tab="dances">
        <DancesPage />
      </Tabbed>
    );
  }

  // `#/tunes/<slug>`: one tune's own page (F4), keyed on the slug alone — the
  // page owns `?band=` and rewrites it itself, and a key on the params would
  // remount it, and stop the tune, on every band switch.
  const tune = tuneSlug(route.path);
  if (tune !== undefined) {
    const page = <TunePage key={tune} slug={tune} params={route.params} />;
    return bare ? page : <Tabbed tab="tunes">{page}</Tabbed>;
  }

  // `#/tunes`: the jukebox (F4). Not keyed on the params: the page owns
  // `?tune=` and `?band=` and rewrites them itself as the music moves on.
  if (route.path === "/tunes") {
    return (
      <Tabbed tab="tunes">
        <TunesPage params={route.params} />
      </Tabbed>
    );
  }

  // Everything else is the hall: `#/`, and `#/dance/<slug>?tune=<slug>`.
  const hall = readHallRoute(route.path, route.params);
  const stage = (
    <HallPage
      key={`${hall.dance ?? ""}|${route.params.get("couples") ?? ""}|${route.params.get("beat") ?? ""}`}
      dance={hall.dance}
      tune={hall.tune}
      params={route.params}
    />
  );
  return bare ? stage : <Tabbed tab="stage">{stage}</Tabbed>;
}

/** The slug of `#/dances/<slug>/traces`, or `undefined` for any other path. */
export function tracesSlug(path: string): string | undefined {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts.length === 3 && parts[0] === "dances" && parts[2] === "traces"
    ? parts[1]
    : undefined;
}

/** The figure id of `#/moves/<figure-id>/traces`, or `undefined` otherwise. */
export function moveTracesId(path: string): string | undefined {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts.length === 3 && parts[0] === "moves" && parts[2] === "traces" ? parts[1] : undefined;
}

/**
 * The slug of `#/dances/<slug>` (plural, the slug alone — the dance page,
 * U3), or `undefined` for any other path: `/dances` itself (no second
 * segment), `/dances/<slug>/traces` (three segments, {@link tracesSlug}'s),
 * and everything under `/moves` or `/dance/<slug>` (singular, the Stage).
 */
export function danceSlug(path: string): string | undefined {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts.length === 2 && parts[0] === "dances" ? parts[1] : undefined;
}

/** The slug of `#/tunes/<slug>` (the tune page, F4), or `undefined` for `/tunes` itself and everything else. */
export function tuneSlug(path: string): string | undefined {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts.length === 2 && parts[0] === "tunes" ? parts[1] : undefined;
}

/** Which tabs there are, in order, and where each one goes. */
const TABS = [
  { id: "stage", label: "Stage", href: "#/" },
  { id: "moves", label: "Moves", href: "#/moves" },
  { id: "dances", label: "Dances", href: "#/dances" },
  { id: "tunes", label: "Tunes", href: "#/tunes" },
] as const;

/**
 * The tab bar, and whatever is under it.
 *
 * Small on purpose: the hall is the page it sits above, and a phone has little
 * enough height already.
 *
 * On the dark theme (U2) it is a band of the hall's wall colour rather than a
 * rule on the page's own ground: the page is wood now, and a hairline border
 * on wood reads as a scratch. The current tab is underlined in the lit floor
 * board, which is the one bright colour the palette has.
 *
 * At the right end, pushed there by the tabs' own `mr-auto`, is V1's
 * build-info badge: an icon the width of the bar's height, which is all the
 * room a phone has to say which build this is.
 */
function Tabbed({
  tab,
  children,
}: {
  tab: (typeof TABS)[number]["id"];
  children: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <nav
        className="flex items-stretch gap-1 border-b border-border bg-muted px-2 text-sm"
        data-testid="tabs"
        aria-label="Sections"
      >
        {TABS.map((t, i) => (
          <a
            key={t.id}
            href={t.href}
            data-testid={`tab-${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`px-3 py-1.5 no-underline ${i === TABS.length - 1 ? "mr-auto" : ""} ${
              t.id === tab
                ? "border-b-2 border-primary font-semibold text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </a>
        ))}
        {/* No vertical padding: the trigger is shorter than a tab, so the
            badge cannot grow the bar — the hall below it is measured against
            what is left. */}
        <span className="flex items-center">
          <BuildInfoBadge />
        </span>
      </nav>
      {children}
    </>
  );
}
