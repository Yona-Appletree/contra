/** A parsed `#/path?query` hash route. */
export interface HashRoute {
  path: string;
  params: URLSearchParams;
}

/**
 * The whole router, for now: read `location.hash`. The demo (M9) needs one
 * hidden route and nothing else, so it does not need a router dependency; M9
 * may bring one when there is more than one screen.
 */
export function hashRoute(hash: string): HashRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const q = raw.indexOf("?");
  return {
    path: q < 0 ? raw : raw.slice(0, q),
    params: new URLSearchParams(q < 0 ? "" : raw.slice(q + 1)),
  };
}
