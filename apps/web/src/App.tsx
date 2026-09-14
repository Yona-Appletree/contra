import type { JSX } from "react";
import { useEffect, useState } from "react";
import { DancesPage } from "./routes/dances.js";
import { FramePage } from "./routes/frame.js";
import { HallPage } from "./routes/hall.js";
import { hashRoute } from "./routes/hashRoute.js";
import { MovesPage } from "./routes/moves.js";
import { PairPage } from "./routes/pair.js";
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

  // `?bare=1` is for screenshots: one canvas, no chrome, so no tab bar either.
  const bare = route.params.get("bare") === "1";

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

  if (route.path === "/dances") {
    return (
      <Tabbed tab="dances">
        <DancesPage />
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

/** Which tabs there are, in order, and where each one goes. */
const TABS = [
  { id: "stage", label: "Stage", href: "#/" },
  { id: "moves", label: "Moves", href: "#/moves" },
  { id: "dances", label: "Dances", href: "#/dances" },
] as const;

/**
 * The tab bar, and whatever is under it.
 *
 * Small on purpose: the hall is the page it sits above, and a phone has little
 * enough height already.
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
        className="flex items-stretch gap-1 border-b px-2 text-sm"
        data-testid="tabs"
        aria-label="Sections"
      >
        {TABS.map((t) => (
          <a
            key={t.id}
            href={t.href}
            data-testid={`tab-${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`px-3 py-2 no-underline ${
              t.id === tab
                ? "border-b-2 border-current font-semibold"
                : "border-b-2 border-transparent opacity-60"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>
      {children}
    </>
  );
}
