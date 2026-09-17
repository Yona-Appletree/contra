/**
 * Whether the band is muted, remembered across visits.
 *
 * Mute is not pause (AC4): a muted player keeps running at gain 0, so the
 * beat stays a linear function of `AudioContext.currentTime` and the hall goes
 * on dancing — the only thing that changes is whether anybody can hear it. It
 * therefore deserves to be remembered on its own key, because somebody who
 * turned the band off wants it off the next time too.
 *
 * Its own key, and only this key: a dance change does not touch it (A2), and
 * the Tunes tab's jukebox has no mute at all, so nothing else reads or writes
 * `hall:muted`.
 */
export const MUTED_KEY = "hall:muted";

/**
 * What the Stage should start muted at: the stored flag, or `false`.
 *
 * Anything but the exact string `"true"` — no entry, a stale value, a storage
 * that throws — reads as unmuted, because a silent hall with no explanation is
 * a worse failure than a loud one.
 */
export function readMuted(storage: Storage | undefined = safeStorage()): boolean {
  if (storage === undefined) return false;
  try {
    return storage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Remember the flag. Never throws: a page that cannot store it still runs. */
export function writeMuted(muted: boolean, storage: Storage | undefined = safeStorage()): void {
  if (storage === undefined) return;
  try {
    storage.setItem(MUTED_KEY, muted ? "true" : "false");
  } catch {
    // A private window, a full quota, a browser with storage switched off:
    // the preference is lost for this visit and nothing else is.
  }
}

/**
 * `localStorage`, when there is one.
 *
 * Reaching for it is itself throwable — a server render has no `window` at
 * all, and some browsers throw on the *property access* rather than on the
 * call — so the guard is around the lookup, not only around the read.
 */
export function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
