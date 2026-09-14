import { useEffect, useState } from "react";
import { FramePage } from "./routes/frame.js";
import { HallPage } from "./routes/hall.js";
import { hashRoute } from "./routes/hashRoute.js";
import { PairPage } from "./routes/pair.js";
import { readHallRoute } from "./state/hallUrl.js";

export function App() {
  const [route, setRoute] = useState(() => hashRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(hashRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Hidden: the single-frame route the golden and perf tests screenshot.
  if (route.path === "/frame") {
    return <FramePage params={route.params} />;
  }

  // The pair page, gate G1's artifact, moved off the front page by M9.
  if (route.path === "/pair") {
    // Keyed on the query, so navigating between `#/pair?...` URLs starts the
    // page again rather than keeping the previous zoom, beat and strip.
    return <PairPage key={route.params.toString()} params={route.params} />;
  }

  // Everything else is the hall: `#/`, and `#/dance/<slug>?tune=<slug>`.
  const hall = readHallRoute(route.path, route.params);
  return (
    <HallPage
      key={`${hall.dance ?? ""}|${route.params.get("couples") ?? ""}|${route.params.get("beat") ?? ""}`}
      dance={hall.dance}
      tune={hall.tune}
      params={route.params}
    />
  );
}
