import type { Angle, Vec2 } from "@caller/core";
import { dirOf, dist } from "@caller/core";
import type { Spots } from "../../figures/ContraFigure.js";
import { solveShape } from "../../set/shape.js";
import type { FigureRole } from "../FigureDefinition.js";
import type { ShapeInput } from "../interpret.js";

/**
 * **The formation's own places**, and how a gatherer finds the ones it wants.
 *
 * `ends: "home"` means a figure reads its end places off the formation instead
 * of guessing them. Resolution hands the instance `params.places`: the home
 * points of the lattice, in the frame's own px, for every dancer of the group
 * the call resolved in. What a shape does with them is its own business —
 * a pair opening out square wants *a pair of places square across the way it
 * faces*, a ring wants *one place each* — and this file is the two searches.
 *
 * ### Why not simply "each dancer's own slot point"
 *
 * That is the reading the milestone brief gives, and Butter disproves it. Its
 * A1 is `circle left 3/4, neighbor swing`, in **becket**, where a neighbour is
 * the dancer straight across the set: the two of them have home slots 32 px
 * apart on opposite lines. A swing that put each of them on their own slot
 * would end with the pair on opposite sides of the set rather than side by side
 * — and `pnpm dance butter` catches it as two larks standing in the same place,
 * 0.000 px apart, at every line length.
 *
 * What a swing really does is settle on to **the nearest two places that suit
 * it**, whoever's they are; that is what makes "balance and swing your
 * neighbour" the progression. So a gatherer asks the formation for places, not
 * for its own dancers' places, and the `endHalf: 10` Butter used to carry was a
 * hand-written answer to exactly this search.
 */

/**
 * **The places one call has already given out, in one frame** (M9d).
 *
 * Two instances of one call settle on places chosen per instance out of one
 * shared pool (`resolve.ts`'s `homesOf`/`lanePlaces`), and until this nothing
 * de-conflicted the choices across them: M8b, M9b and M9c each measured the
 * same fault — two dancers finishing a swing on one floor point with a place
 * beside them empty, at Are You 'Most Done?'s beat 80, Contrablend's beat 80
 * and Jeremy Corners' beat 48.
 *
 * The ledger is the channel M9b got furthest with, in the form M9c's deviation
 * 3 said it would have to take to be honest. Three properties make it so:
 *
 * - **Per frame, not per call.** A pool is frame-local px and the two minor
 *   sets of a duple improper line hold the same four numbers in two frames;
 *   one ledger per call took `(−16, 60)` away from Chorus Jig's second hands-
 *   four and left `c2/lark` standing on `c3/lark`.
 * - **Keyed by the instance**, so it is *idempotent*. A plan is built three or
 *   more times for one instance (`joins`, `moves`, then `ends`/`sample`) and
 *   `settleEnds` runs on every one of them. An instance reads only the claims
 *   of instances **before** it in resolution order and overwrites its own, so
 *   re-planning it — in any order, any number of times — gives the same answer.
 *   By induction the whole ledger is a function of the resolution alone.
 * - **Ranked, not filtered.** A taken place is sorted last, never removed. A
 *   pair that cannot avoid one still lands on the formation's places rather
 *   than falling back to "however far apart we happen to be", so a figure can
 *   never come out *worse* than it did before the ledger existed, and where
 *   there is no conflict at all the answer is today's to the last bit.
 */
export interface PlaceLedger {
  /** What each instance of this call took, by its index in resolution order. */
  readonly by: Map<number, readonly Vec2[]>;
  /**
   * Places nobody may settle on: a dancer standing through this call is on
   * them for its whole span.
   *
   * The brief's own rule — *a dancer on hold-place occupies their place* — and
   * Jeremy Corners' beat 48 is what it is for: B1's gathering swing settled the
   * ones on to the two places the twos had been standing on since beat 32,
   * because the twos are an instance of the call too, on hold-place, and a pool
   * of the group's four homes says nothing about who is already on them.
   */
  readonly held: Vec2[];
}

/** One instance's seat at the ledger: everybody's claims, and which one is mine. */
export interface PlaceClaim {
  readonly ledger: PlaceLedger;
  /** This instance's index in the order the call resolved its instances. */
  readonly me: number;
}

/**
 * The parameter a {@link PlaceClaim} rides in.
 *
 * Resolution's, like `homes`, `nearby` and `slots`: a fact about the call's
 * *resolution* that a figure cannot work out for itself. No dance record ever
 * writes it and no figure reads it directly — `settleEnds` and the two searches
 * do, through {@link takenIn}.
 */
export const CLAIMS_PARAM = "claims";

/** How near two places have to be to be the same place, px. */
const SAME_PLACE_PX = 1e-9;

/**
 * The places this instance may not have: everything the instances before it in
 * resolution order took, plus everything a dancer is standing through the call
 * on.
 *
 * Empty for a figure planned outside a resolution — `pnpm figure`, a probe, the
 * Moves gallery — which is what keeps those exactly as they were.
 */
export function takenIn(params: Readonly<Record<string, unknown>>): readonly Vec2[] {
  const claim = params[CLAIMS_PARAM] as PlaceClaim | undefined;
  if (claim === undefined) return [];
  const out: Vec2[] = [...claim.ledger.held];
  for (const [index, places] of claim.ledger.by) {
    if (index < claim.me) out.push(...places);
  }
  return out;
}

/**
 * Record which of the pool this instance actually ended on.
 *
 * Read off the plan's own ends rather than off the search, so what is claimed
 * is where the dancers really finish: a figure whose ends are not on the
 * formation's places at all (an allemande's `"turned"` ends, a wave in mid set)
 * claims nothing, which is the truth about it.
 */
export function recordClaim(
  params: Readonly<Record<string, unknown>>,
  pool: readonly Vec2[],
  ends: Readonly<Record<string, { p: Vec2 }>>,
): void {
  const claim = params[CLAIMS_PARAM] as PlaceClaim | undefined;
  if (claim === undefined || pool.length === 0) return;
  const took: Vec2[] = [];
  for (const spot of Object.values(ends)) {
    for (const place of pool) {
      if (dist(place, spot.p) <= SAME_PLACE_PX) {
        took.push(place);
        break;
      }
    }
  }
  claim.ledger.by.set(claim.me, took);
}

/** Whether one of `taken` is this very place. */
const isTaken = (taken: readonly Vec2[], place: Vec2): boolean =>
  taken.some((other) => dist(other, place) <= SAME_PLACE_PX);

/**
 * How far off square a pair of places may be and still count: 30°, as a cosine.
 *
 * `placeHalf`, the coded figures' own version of this search, uses **0.99** —
 * about eight degrees — and that is the second half of why Butter carried
 * `endHalf: 10`. A pair the hey leaves a few degrees off square opens out a few
 * degrees off square, and at ten degrees `0.99` rejects the two places the pair
 * is standing between, falls back to "however far apart we happen to be", and
 * the swing ends wherever it was rather than on the set's places. A gatherer has
 * to recognise the places it is walking toward even when it is not lined up with
 * them yet, so the slop is the width of a figure's honest wobble rather than of
 * floating-point noise. Anything further off square than this is a different
 * pair of places, and the fallback is the right answer.
 */
const SQUARE_SLOP = Math.cos((30 * Math.PI) / 180);

/** A pair of the formation's places, and where they sit. */
export interface PlacePair {
  /** The two places themselves, frame-local px, in no particular order. */
  ends: readonly [Vec2, Vec2];
  /** Half way between the two. */
  centre: Vec2;
  /** Half the distance between them, px. */
  half: number;
}

/**
 * How near two gaps have to be to count as the same answer, px.
 *
 * Two candidate pairs of places symmetric about the same point have **exactly**
 * the same midpoint, so this is floating-point slop and not a tolerance with a
 * judgement in it.
 */
const SAME_GAP_PX = 1e-9;

/**
 * The two places square across `facing` whose midpoint is nearest `centre`, and
 * — among the pairs that tie — the one whose two places are as far apart as the
 * two dancers already are.
 *
 * This is `placeHalf`'s own search — the one the coded swing and allemande do
 * over the group's stations — answering with the **midpoint** as well as the
 * half-distance. The midpoint is the half that was missing: the coded figures
 * opened out `half` px either side of wherever the pair happened to meet, so a
 * pair left diagonal by a hey opened out diagonally, off the places, and a
 * dance had to write `endHalf` by hand to keep the spacing sane.
 *
 * ### Why the midpoint alone is not enough (M7b, A Rare Bird)
 *
 * The midpoint says *where* the pair lands and nothing at all about *how far
 * apart*. Over a minor set's four places that never mattered: no two candidate
 * pairs there share a midpoint unless they also share a span. Over the **lane**
 * it matters every time, because a line's places are symmetric about their own
 * middle, so every pair of places straddling the pair's centre ties at a gap of
 * exactly zero and the widest one wins on list order alone.
 *
 * A Rare Bird is where that was measured. Its A1 reaches N3, which exists only
 * at six couples, and the N3 shoulder round is `c0/lark` with `c5/robin`
 * standing one place apart at `(16, 40)` and `(16, 60)`. Handed the whole line's
 * twelve homes, the search answered `(16, 0)` and `(16, 100)` — the same
 * midpoint, a hundred pixels apart — so the two of them flung out five places
 * each as the turn opened, and `c0/lark` landed exactly on `c1/robin`, who had
 * no N2 and no N3 and had been standing on `(16, 0)` since beat 2. That is the
 * dance's `collision 0.000 px`, and it is a tie broken by array order rather
 * than a fact about the dance.
 *
 * So the tie-break is the pair's own separation: a pair settles on to the two
 * places it is standing **between**. It changes nothing where the search was
 * never ambiguous, which is every dance in the programme.
 *
 * ### `taken` sorts a place last, it does not remove it (M9d)
 *
 * The places another instance of this call has already settled on are ranked
 * behind every pair that avoids them, and nothing else about the search
 * changes. With none — every dance until this milestone — the comparison is
 * bit-for-bit the one above.
 *
 * **And when every square pair is spoken for, the pair takes the nearest free
 * pair of places instead.** That is Contrablend's beat 80, measured: at the
 * second time through the per-role progression leaves both pairs of A1's
 * balance and swing meeting on the middle of the hands-four and ending
 * *diagonally* (58° and 238°), and a hands-four holds exactly **one** diagonal
 * square to that — so the second pair's only square candidate was the two
 * places the first pair had just taken, and ranking alone could not move it.
 * The other diagonal is a perfectly good pair of the formation's places; what
 * it is not is square to the way the pair happens to be facing, and
 * `endFacingOf`'s second pass reads the facing back off the places it lands on.
 * The search is therefore two-tier: square pairs first, exactly as before, and
 * the whole pool only if the best square pair is one somebody else is on — so a
 * call with no conflict in it never reaches the second tier at all.
 */
export function placePairFor(
  places: readonly Vec2[],
  centre: Vec2,
  facing: Angle,
  fallbackHalf: number,
  taken: readonly Vec2[] = [],
): PlacePair {
  const left = dirOf(facing - 90);
  const fallback: PlacePair = {
    ends: [
      [centre[0] + left[0] * fallbackHalf, centre[1] + left[1] * fallbackHalf],
      [centre[0] - left[0] * fallbackHalf, centre[1] - left[1] * fallbackHalf],
    ],
    centre,
    half: fallbackHalf,
  };
  const square = pairSearch(places, centre, facing, fallbackHalf, taken, fallback, true);
  if (square.taken === 0) return square.pair;
  // **Every square pair is spoken for**: the free places are a pair of the
  // formation's own, just not one square to the way this pair happens to be
  // facing. Taken only when it really is freer than the square answer.
  const anywhere = pairSearch(places, centre, facing, fallbackHalf, taken, fallback, false);
  return anywhere.taken < square.taken ? anywhere.pair : square.pair;
}

/** One pass of {@link placePairFor}'s search, over the square pairs or over all of them. */
function pairSearch(
  places: readonly Vec2[],
  centre: Vec2,
  facing: Angle,
  fallbackHalf: number,
  taken: readonly Vec2[],
  fallback: PlacePair,
  squareOnly: boolean,
): { pair: PlacePair; taken: number } {
  const axis = dirOf(facing + 90);
  let best = fallback;
  let bestGap = Infinity;
  let bestSpread = Infinity;
  let bestTaken = Infinity;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i]!;
      const b = places[j]!;
      const span = dist(a, b);
      if (span < 1e-9) continue;
      const unit: Vec2 = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
      // Square across the way the pair will face, to within {@link SQUARE_SLOP}.
      if (squareOnly && Math.abs(unit[0] * axis[0] + unit[1] * axis[1]) < SQUARE_SLOP) continue;
      const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const gap = dist(mid, centre);
      // How much wider or narrower than the pair itself these two places are.
      const spread = Math.abs(span - 2 * fallbackHalf);
      // How many of this pair somebody else of the same call is already on.
      const spoken = (isTaken(taken, a) ? 1 : 0) + (isTaken(taken, b) ? 1 : 0);
      if (spoken < bestTaken) {
        bestTaken = spoken;
        bestGap = gap;
        bestSpread = spread;
        best = { ends: [a, b], centre: mid, half: span / 2 };
        continue;
      }
      if (spoken > bestTaken) continue;
      const nearer = gap < bestGap - SAME_GAP_PX;
      const tied = Math.abs(gap - bestGap) <= SAME_GAP_PX && spread < bestSpread;
      if (nearer || tied) {
        bestGap = Math.min(gap, bestGap);
        bestSpread = spread;
        best = { ends: [a, b], centre: mid, half: span / 2 };
      }
    }
  }
  // Nothing at all matched: the fallback is nobody's place, so it takes none.
  return { pair: best, taken: bestTaken === Infinity ? 0 : bestTaken };
}

/**
 * Which place each role takes, so that the total distance walked is least.
 *
 * "Nobody crosses anybody on the way home". It is the identity when the shape
 * already ends on the places, which is what makes a gatherer from the stations
 * agree with the coded figure it replaced exactly (DD21).
 *
 * Every instance in this milestone casts two dancers or four, so trying every
 * permutation is the honest thing rather than importing an assignment algorithm
 * for a problem of size four. It refuses anything bigger by name.
 *
 * `taken` (M9d) is the places another instance of the same call has already
 * settled on, and it is a **first key** on the same search: fewest places taken
 * off somebody else first, least walked second. With none the comparison is the
 * one it always was.
 */
export function nearestPlaces(
  natural: readonly Vec2[],
  places: readonly Vec2[],
  taken: readonly Vec2[] = [],
): Array<Vec2 | undefined> {
  const n = natural.length;
  if (n > 4) throw new Error(`settling on to places is written for up to four dancers, not ${n}`);
  if (places.length < n) return natural.map(() => undefined);
  const spoken = places.map((place) => (isTaken(taken, place) ? 1 : 0));
  let best: number[] | undefined;
  let bestCost = Infinity;
  let bestTaken = Infinity;
  for (const choice of choices(places.length, n)) {
    let cost = 0;
    let clashes = 0;
    for (let i = 0; i < n; i++) {
      cost += dist(natural[i]!, places[choice[i]!]!);
      clashes += spoken[choice[i]!]!;
    }
    if (clashes < bestTaken || (clashes === bestTaken && cost < bestCost - 1e-12)) {
      bestTaken = clashes;
      bestCost = cost;
      best = choice;
    }
  }
  return best === undefined ? natural.map(() => undefined) : best.map((at) => places[at]!);
}

/** Every ordered choice of `k` distinct indices out of `n`. */
function choices(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  const out: number[][] = [];
  for (const rest of choices(n, k - 1)) {
    for (let i = 0; i < n; i++) {
      if (rest.includes(i)) continue;
      out.push([...rest, i]);
    }
  }
  return out;
}

/**
 * **Where a figure really leaves people**: its own natural ends, put into the
 * shape it says it forms, and then settled on to the formation's places.
 *
 * The one function every shape kind ends with, so that Q6's target and M2's
 * honest ends are applied in the same order everywhere and exactly once. The
 * order matters and is the honest one: the **arrangement** first (four dancers
 * in a ring rather than in a row), the **places** second (that ring on the
 * formation's own four places rather than a pixel off them). Doing it the other
 * way round would settle people on to places and then move them off again.
 *
 * `order` is the order the *shape* stands in, which is not the cast order: a
 * line of four's is the call's own `M1-W2-M2-W1`. Left out, the cast order.
 */
export function settleEnds(
  input: ShapeInput,
  natural: Spots,
  order: readonly FigureRole[] = input.roles,
): Spots {
  const shaped = input.target === undefined ? natural : formed(input, natural, order);
  if (!input.gathers || !input.places) return shaped;
  const points: Record<FigureRole, Vec2> = {};
  for (const role of input.roles) {
    const spot = shaped[role];
    if (spot) points[role] = spot.p;
  }
  const settled = settleOnPlaces(input.roles, points, input.places, input.taken ?? []);
  const out: Spots = { ...shaped };
  for (const role of input.roles) {
    const spot = shaped[role];
    const place = settled[role];
    // The **facings are the shape's own**, kept exactly: a ring ends facing its
    // middle, which is not the facing any home slot carries.
    if (spot && place) out[role] = { p: place, facing: spot.facing };
  }
  return out;
}

/** The natural ends, rearranged into the shape the figure says it forms. */
function formed(input: ShapeInput, natural: Spots, order: readonly FigureRole[]): Spots {
  const target = input.target!;
  const here = order.filter((role) => natural[role] !== undefined);
  if (here.length === 0) return natural;
  const solved = solveShape(
    target,
    here.map((role) => natural[role]!),
    input.ctx.spacing,
  );
  const out: Spots = { ...natural };
  here.forEach((role, i) => {
    const spot = solved.spots[i];
    if (spot) out[role] = { p: spot.p, facing: spot.facing };
  });
  return out;
}

/** A role-keyed map of natural end points, settled on to the formation's places. */
export function settleOnPlaces(
  roles: readonly FigureRole[],
  natural: Readonly<Record<FigureRole, Vec2>>,
  places: readonly Vec2[],
  taken: readonly Vec2[] = [],
): Record<FigureRole, Vec2> {
  const taking = roles.filter((role) => natural[role] !== undefined);
  const chosen = nearestPlaces(
    taking.map((role) => natural[role]!),
    places,
    taken,
  );
  const out: Record<FigureRole, Vec2> = { ...natural };
  taking.forEach((role, i) => {
    const place = chosen[i];
    if (place) out[role] = place;
  });
  return out;
}
