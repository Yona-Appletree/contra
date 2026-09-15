// The digest that ties public/soundfont/manifest.json to the tunes it was
// built for: SHA-256 over every tune's written ABC, in `tunes` order. The build
// script writes it; `src/soundfont.test.mjs` recomputes it, so a tune edited
// without a rebuild fails CI with the command to run.
import { createHash } from "node:crypto";

/** @param {ReadonlyArray<{ abc: string }>} tunes */
export function tunesDigest(tunes) {
  return createHash("sha256")
    .update(tunes.map((tune) => tune.abc).join("\n"))
    .digest("hex");
}
