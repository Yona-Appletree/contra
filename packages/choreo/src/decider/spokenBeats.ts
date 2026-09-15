import type { Beat } from "@caller/core";

/**
 * A rhythm estimate of how long a call takes a caller to say, in beats.
 *
 * The user: "the calls stay around too long. they should stay around either
 * how many beats they are, or maybe 1 or 2 beats past. but not until the next
 * call." A call has no recorded audio to measure, so this counts syllables —
 * roughly two a beat, which is a comfortable calling cadence — and rounds up,
 * with a floor of one beat so a one-syllable call ("SWING") still gets a beat
 * to be heard in. "BALANCE AND SWING" is four syllables, two beats;
 * "ROBINS CHAIN TO YOUR PARTNER" is seven, four beats — both the user's own
 * examples (director log, 2026-09-14).
 *
 * This is an estimate, not a scan of a real recording, and it is meant to be
 * overridden: a `FigureCall.spokenBeats` on the dance's own data, or a
 * `FigureDef.spokenBeats` the figure itself declares, both win over it (see
 * `createScriptDecider`'s `say` loop). Nothing in the demo sets either yet.
 */
export function spokenBeats(text: string): Beat {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllables = words.reduce((n, word) => n + syllablesIn(word), 0);
  return Math.max(1, Math.ceil(syllables / 2));
}

/**
 * A rough syllable count for one word: vowel groups, minus a silent trailing
 * `e` (or `es`/`ed` sitting on one), floored at one.
 *
 * Not a dictionary and not phonetic — a caller's calls are short, capitalised,
 * everyday words ("BALANCE", "SWING", "PARTNER"), and this is tuned to get
 * those right rather than to parse English in general. Punctuation (the comma
 * in "NEXT: BUTTER, BY GENE HUBERT", a hyphen in "DO-SI-DO") is stripped
 * before counting.
 */
function syllablesIn(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  // A trailing silent `e` — "dance", "chain*s*" — is not its own syllable;
  // stripping it before counting vowel groups is what keeps "lines" (one
  // syllable) from reading as two ("li" + "e").
  const stripped = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  const base = stripped === "" ? word : stripped;
  const groups = base.match(/[aeiouy]{1,2}/g);
  return groups === null ? 1 : Math.max(1, groups.length);
}
