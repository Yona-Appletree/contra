import type { Beat } from "@caller/core";
import { CLEARANCE_PX } from "../../figures/ContraFigure.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **The chain's three numbers**, from the coded chain M11 deleted.
 *
 * They are the figure's own tuning — where the robins pass, when she joins his
 * orbit, how early he starts turning — and every word of why each is what it is
 * was written against the figure they govern rather than against the code that
 * read them, so they come across whole.
 */
/**
 * How far to her own left of the set's centre each robin passes on an orbit
 * chain, px: **half the library's own clearance**, 4.25.
 *
 * The two robins' paths are point reflections of each other through the set's
 * centre at every instant (F8's closed form, and it is still true here), so the
 * pair's clearance at the pull by is twice one robin's distance from that
 * centre and nothing else — which makes "the smallest dip that keeps them at or
 * above the torso floor" arithmetic rather than a sweep. Exactly 4 px puts them
 * exactly 8.000 px apart, which is AC6's floor **and** AC6's own test is a
 * strict `>`, so the dip that actually clears it is the next number the library
 * already has: {@link CLEARANCE_PX} halved, which is 4.25 and puts them
 * **8.500 px** apart — the same room every other figure for two leaves the pair
 * beside it.
 *
 * It is *to her own left* because that is what passes right shoulders in this
 * coordinate system (y down; see {@link passRight}), and because without it the
 * pass is the wrong way round: her take lies up the hall of the straight line
 * from her place to her new one, so the undipped paths cross with each robin on
 * the other's **left**.
 */
export const CHAIN_PASS_PX = CLEARANCE_PX / 2;

/**
 * Which beat of the orbit chain the robin joins the lark on: **4** of eight —
 * half the figure to pull by and cross, half to turn.
 *
 * The user, F10, describing what he had just watched: "the robins pull by to
 * join the larks 1/4 of the way through. (2 beats)". The user again on
 * 2026-09-16, watching it danced: *"in the chain the pull-by is still too fast
 * and the turn too slow. it should be about 4 beats each."* This is that
 * ruling, and it is the count every caller teaches: four to chain across, four
 * to courtesy turn.
 *
 * **What had to change for the number to be free.** While the lark's orbit
 * spanned the whole figure, moving the join dragged the robin's take round his
 * circle with it — she arrives at the circle's *antipode*, so a later join is a
 * take further round and further back out of the set. M10c measured the ladder:
 * twice how near her undipped walk comes to the middle of the set was 8.477 px
 * at two beats, 10.643 at 2.5, 13.716 at three and **14.050 at 3.05**, against
 * the library's own `HOLD_SPACING_PX` of 14 — so past three beats the two
 * robins stopped passing at all, and at four the right hands the figure still
 * joined were 32 px apart and `reach` failed by 3.1817 px in every
 * chain-calling dance.
 *
 * {@link CHAIN_LARK_LEAD_BEATS} is what took that wall away: his turn starts
 * when she is nearly there rather than at beat zero, so her take is the near
 * side of his circle — deep in the set, where a right-shoulder pull by reaches
 * it — whatever beat she arrives on. The join beat and the take stopped being
 * the same lever.
 */
export const CHAIN_JOIN_BEAT: Beat = 4;

/**
 * How long before the join the lark's own turn begins, beats: **1**.
 *
 * A chain's lark does not orbit from the first beat — he **receives** her. The
 * robins have the middle of the set to themselves while they pull by and cross
 * it, and he comes to meet the one arriving at his couple over the last beat of
 * it, so that the pair is already moving together when the hands close.
 *
 * The sentence this replaces — "the lark is moving from the first beat, not
 * waiting on his place" — was the coded figure's reading of an eight-beat
 * orbit, not something the user said; what he described was one whole turn
 * inside eight beats and the robins joining it part way through, which is what
 * this still is.
 *
 * **One and not zero, measured.** M10c compared a lark who stands dead still
 * through the pull by against one who has already begun, on the evenness of his
 * own per-beat speeds, which is the user's standing criterion ("people try to
 * move at a constant speed throughout the moves for the most part"); the
 * numbers and the whole ladder are in the milestone's report.
 */
export const CHAIN_LARK_LEAD_BEATS: Beat = 0;

/**
 * How long the couple takes to open out on to its two places, beats.
 *
 * The rotation happens at the hold and the places are a set's width apart, so
 * the last beat and a half of the figure is the couple opening out and letting
 * go at the same time.
 */
const OPEN_BEATS = 1.5;

/**
 * **Robins chain**, as data: the two robins pull by the right in the middle,
 * and each joins the backward orbit of the lark whose couple she is arriving
 * at.
 *
 * The user, watching a video walkthrough (F10): "the larks orbit backwards 1
 * full turn around the point between where they and the robin started. the
 * robins pull by to join the larks 1/4 of the way through. (2 beats) they both
 * finish the orbit."
 *
 * **M10c left the join where it is**, against the user's later ruling — "in the
 * chain the pull-by is still too fast and the turn too slow. it should be about
 * 4 beats each". Three walls stand in the way of every value between two beats
 * and four, and all three of their numbers are on `CHAIN_JOIN_BEAT`: this
 * figure's own pull-by hand is what the library's motion bounds are derived
 * from, the `elbowPerHand` ratio rises as the take slows, and past 3.05 beats
 * the two robins stop passing at all.
 *
 * **A6: the orbit is the only regime the chain ships.** F13 made it the
 * default and kept F9's four earlier candidates reachable behind `?chain=` for
 * comparison; M4 takes them away, with `CHAIN_CANDIDATES`, `?chain=` and
 * `pnpm figure --chain`. So `stepInPx`, `pivotFromLark` and `pullBeats` are
 * gone from this figure's parameters: an orbit has one circle and no pivot to
 * choose, and its pull by **is** its join.
 */
export const robinsChainDefinition: FigureDefinition = {
  id: "robins-chain",
  call: "ROBINS CHAIN",
  describe:
    "The two robins take right hands in the middle and pull by, passing right shoulders, and carry on across the set: four beats to chain across, four to turn. The lark of the couple each robin is arriving at waits on his own place while they cross, and receives her: from the halfway point he backs a whole turn round a small circle centred halfway between his own place and the place beside him, one hold across. She reaches him at the far side of that circle just as it begins, and takes it up with him — her left hand in his left, her own right hand behind her own back and his right hand on it — walking forward as he walks backward, both of them turning about that same centre. They face directly out of the set together half way through the turn and back in at the end, with the robin now on the lark's right, and the couple opens out on to the two places. He ends where he started, facing the way he already faced: the whole effect of a chain is that the robins have traded and each couple has a new robin. (unsure: a lark can twirl her under his hand instead, and this only scoops.)",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      chains: "robin",
      holdDrop: 6,
      stackPx: 1,
      joinBeat: CHAIN_JOIN_BEAT,
      passPx: CHAIN_PASS_PX,
      larkLead: CHAIN_LARK_LEAD_BEATS,
    },
  },
  shape: {
    kind: "courtesyTurn",
    regime: "orbit",
    // One role chains across; whose lark is whose is decided by the facing her
    // landing place carries, not by who is nearest.
    pairing: { kind: "chain", param: "chains" },
    ends: { kind: "trade" },
    // An orbit chain's pull by *is* its join: she walks on to the lark's circle
    // and the figure turns from there.
    approachBeats: { param: "joinBeat" },
    // The orbit shapes her whole approach itself, as a curve through the pull
    // by, so there is no bow to add to it.
    bow: 0,
    // An orbit has one circle and no pivot to choose.
    pivotFromLark: 0,
    passPx: { param: "passPx" },
    openBeats: OPEN_BEATS,
    closeBeats: 0,
    // M10c: how long before the join his own turn begins. He receives her; he
    // does not orbit from the first beat.
    larkLead: { param: "larkLead" },
    backHands: true,
    hands: {
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      pullDrop: { param: "holdDrop" },
    },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "cruise" },
  symmetry: {
    mirror: {
      kind: "handed",
      why:
        "the lark orbits **backwards** and the robins pull by the **right**: both are one sign " +
        "in `orbitTurn`, and a chain that turned the other way with a left-shoulder pull by is " +
        "a figure nobody dances.",
    },
    // "Larks chain" is this same figure with one word changed.
    roles: ["chains"],
  },
};
