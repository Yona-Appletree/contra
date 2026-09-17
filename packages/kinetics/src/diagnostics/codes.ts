/**
 * Every diagnostic code, with the one-line explanation `dance check
 * --explain` would print. Codes are stable: a test that pins a code is
 * pinning a kind of complaint, not a message.
 */
export const CODES: Readonly<Record<string, { title: string; explain: string }>> = {
  K001: {
    title: "syntax",
    explain: "The text does not parse. The caret marks where reading stopped.",
  },
  K002: {
    title: "check",
    explain:
      "The text parses but says something that cannot be right: a wrong enum member, an unknown module, a mistyped argument.",
  },
  K010: {
    title: "compile",
    explain:
      "A statement the compiler cannot carry out for this dancer: an unknown move, a bad argument, a module that calls itself.",
  },
  K011: {
    title: "unprovided",
    explain:
      "A $ variable no group of this floor provides. Provide it in the formation, or pass it at the call.",
  },
  K012: {
    title: "assert",
    explain: "An assert in the dance was false for this dancer at this beat.",
  },
  K013: {
    title: "seating",
    explain:
      "A commit left the floor inconsistent: two dancers on a place, or a dancer on a place that does not exist.",
  },
  K020: {
    title: "timing",
    explain: "A figure has fewer beats than its entry and exit leave for its body.",
  },
  K021: { title: "rate", explain: "An orbit would have to turn faster than a body can." },
  K022: { title: "step", explain: "A planned step is longer than a stride." },
  K023: { title: "pivot", explain: "A planned turn is more than a body pivots in a beat." },
  K024: { title: "reach", explain: "A hold would be taken further away than an arm reaches." },
  K025: { title: "unplannable", explain: "The scheduler found no plan for the entry or the exit." },
  K030: { title: "stride", explain: "A long step: allowed, but worth a look." },
  K031: { title: "truncated", explain: "An intrinsic figure was cut short to fit its beats." },
  K040: {
    title: "execute",
    explain: "The executor planned a hand an arm cannot reach; the arm points at it instead.",
  },
  K050: {
    title: "solve",
    explain:
      "The solver's own limits: a hand out of reach, the torso or the neck turning too fast.",
  },
  K060: {
    title: "proof",
    explain: "A point's speed or acceleration is over its physical cap, or it jumped, at a sample.",
  },
  K101: {
    title: "overlap",
    explain: "Two bodies closer than a body's width with no hold joining them.",
  },
  K102: { title: "hands", explain: "Two hands at one point with no hold between the dancers." },
  K103: {
    title: "drift",
    explain: "A dancer ends a figure away from the place the next one starts from.",
  },
  K104: {
    title: "phrase",
    explain: "An assert on the beat or the time through failed: the dance is off the phrase.",
  },
  K105: {
    title: "desync",
    explain:
      "The branches of a split on a role or a $ consume different beats, so the dancers' threads drift apart.",
  },
  K106: {
    title: "asymmetric",
    explain:
      "A figure's members do not all name the same people: a partner who names someone else, a ring of four that is not the same four.",
  },
};

export const explain = (code: string): string => CODES[code]?.explain ?? "an unknown code";
