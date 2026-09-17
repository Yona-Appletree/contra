import type { DancerId } from "../Dialect.js";
import type { Seating } from "./formations.js";
import { slotFor } from "./relations.js";

/**
 * The group words a contra program says. One so far: `hands-four`.
 *
 * A group is resolved from a dancer the way a selector is — the dialect works
 * it out from where people stand — but it answers with **several** dancers in
 * a fixed order, because the figures that take one (a circle, a balance the
 * ring, a star) are danced round a ring and every dancer needs to know who is
 * on their left and who is on their right. P10 defines those figures; this is
 * only the resolution.
 */
export const CONTRA_GROUPS = ["hands-four"] as const;

/** Whether this word is one of them. */
export const isContraGroup = (word: string): boolean =>
  (CONTRA_GROUPS as readonly string[]).includes(word);

/**
 * **Hands four**: the four of you — you, your partner, your neighbour and
 * their partner — in **ring order clockwise from you**.
 *
 * Clockwise is the screen's sense with y down, which is the same sense a
 * facing turns in (`facing + 90°` is a dancer's right) and the way a **circle
 * left** turns: everybody in a ring moving to their own left walks round it in
 * this order, so the second dancer in the list is standing in the place you
 * would circle left into, and the third is across the ring from you.
 *
 * The ring is read off the floor rather than off the couple numbers: the four
 * are sorted by their bearing from the middle of the four and rotated to start
 * at the asking dancer. That is the same answer in either formation — becket's
 * ring is two couples side by side facing across, duple improper's is two
 * couples facing along the hall — and it stays the right answer when a set is
 * standing somewhere its numbering does not predict, which a becket set at
 * beat 0 is (see `formations.ts`).
 *
 * **Nobody is an answer.** A dancer whose neighbour is nobody — the couples at
 * the end of a line — is in no hands four at all, and gets `undefined`, which
 * `if (four) { … } else { … }` branches on.
 */
export function handsFour(seating: Seating, from: DancerId): DancerId[] | undefined {
  const me = seating.seatOf(from);
  if (me === undefined) return undefined;
  const partner = seating.at(slotFor(seating.formation, "partner", me));
  const neighbor = seating.at(slotFor(seating.formation, "neighbor", me));
  if (partner === undefined || neighbor === undefined) return undefined;
  const theirSeat = seating.seatOf(neighbor);
  if (theirSeat === undefined) return undefined;
  const theirPartner = seating.at(slotFor(seating.formation, "partner", theirSeat));
  if (theirPartner === undefined) return undefined;
  return ringFrom(seating, [from, partner, neighbor, theirPartner]);
}

/** The four, clockwise from the first of them. */
function ringFrom(seating: Seating, four: readonly DancerId[]): DancerId[] | undefined {
  const seats = four.map((id) => seating.seatOf(id));
  if (seats.some((seat) => seat === undefined)) return undefined;
  const places = seats.filter((seat) => seat !== undefined);
  const cx = places.reduce((sum, seat) => sum + seat.p[0], 0) / places.length;
  const cy = places.reduce((sum, seat) => sum + seat.p[1], 0) / places.length;
  const clockwise = [...places].sort(
    (a, b) => Math.atan2(a.p[1] - cy, a.p[0] - cx) - Math.atan2(b.p[1] - cy, b.p[0] - cx),
  );
  const start = clockwise.findIndex((seat) => seat.id === four[0]);
  if (start < 0) return undefined;
  const ring: DancerId[] = [];
  for (let i = 0; i < clockwise.length; i += 1) {
    const seat = clockwise[(start + i) % clockwise.length];
    if (seat === undefined) return undefined;
    ring.push(seat.id);
  }
  return ring;
}
