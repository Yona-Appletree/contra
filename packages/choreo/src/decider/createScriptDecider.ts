import type { Beat } from "@caller/core";
import type { Dance, Program } from "../dance/Dance.js";
import { danceBeats, danceSchedule, validateDance } from "../dance/Dance.js";
import type {
  DancerId,
  Formation,
  GroupPlan,
  GroupSelector,
  HallState,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "../formation/Formation.js";
import { HANDS_FOUR_GROUP, createHall } from "../formation/Formation.js";
import type { LineUpShift } from "../formation/lineUpShift.js";
import { lineUpShiftOf, shiftPlaces } from "../formation/lineUpShift.js";
import type { AnyFigureDef, EndPose, FigureRegistry } from "../figure/FigureDef.js";
import { withDefaults } from "../figure/FigureDef.js";
import { APPLAUD } from "../figure/applaud.js";
import { TAKE_HANDS, lineUpPlaces } from "../figure/takeHands.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import type { Group } from "../group/Group.js";
import { createGroup } from "../group/Group.js";
import type { Timeline, TimelineEvent } from "../timeline/Timeline.js";
import { createTimeline } from "../timeline/Timeline.js";
import type { ChoreoLibrary, Decider, ScriptDeciderOptions, ScriptPosition } from "./Decider.js";
import { SCRIPT_DECIDER_DEFAULTS, danceOf, formationOf } from "./Decider.js";
import { complementOf, resolveSelector } from "./resolveSelector.js";
import { spokenBeats } from "./spokenBeats.js";

/**
 * The script decider: it dances the program as written.
 *
 * Every time through, it asks the formation — **call by call** — how the set
 * divides up for that call (`Formation.groupsFor`, a partition of the whole
 * set), plays the figure into each group that dances it, fills whatever beats
 * nobody claimed for the couples standing out with `wait-out`, says each call
 * `lead` beats early, and then asks the formation's progression what the set
 * looks like next. The program loops, so the demo cycles without anyone
 * touching it.
 *
 * **Between two dances** the dancing stops and a real interval runs, in five
 * stretches whose lengths are {@link ScriptDeciderOptions}': the hall applauds
 * where it stands (`applaud`, facing the band); the caller announces the next
 * dance's title and author and then how to stand for it, in the *formation's*
 * own words (`Formation.lineUpCalls`); everybody walks to where they take hands
 * four; they take hands four **in a ring** (`take-hands`), moving one place
 * round it if the formation's own progression runs sideways — which is what
 * makes a becket dance becket; and the band plays four potatoes into the dance
 * while the ring opens out on to that dance's first places. Nothing of the
 * dance happens in any of it, and nothing but the potatoes sounds, which is
 * `apps/web/src/program.ts`'s side of the same arithmetic.
 *
 * A dance's first places are the formation's stations unless it says otherwise
 * (`Dance.startPlaces`), which is what lets a becket dance whose first figure is
 * the progression be danced at all: the minor set the time through runs in is
 * the one that figure makes, so the dancers — the waiting couple included —
 * begin one couple place back along their own line.
 *
 * `hall` is read for where each set stands, how it is turned and how many
 * couples it holds — its {@link SetSpec}s. The decider seats those specs in
 * whichever formation the programme's first dance is written in, and re-seats
 * them at every line-up where the formation changes, so a caller never has to
 * know which formation to hand it a hall in.
 *
 * Nothing here knows what a lark is, what a swing is, or what a hall looks
 * like. Everything contra comes from the formation and the figure registry.
 */
export function createScriptDecider(
  program: Program,
  registry: FigureRegistry,
  hall: HallState,
  library: ChoreoLibrary,
  options: Partial<ScriptDeciderOptions> = {},
): Decider {
  if (program.items.length === 0) throw new Error(`program "${program.slug}" has no items`);
  const opts: ScriptDeciderOptions = { ...SCRIPT_DECIDER_DEFAULTS, ...options };

  if (!registry.has(WAIT_OUT.id)) registry.register(WAIT_OUT);
  if (!registry.has(WALK_TO_STATION.id)) registry.register(WALK_TO_STATION);
  if (!registry.has(APPLAUD.id)) registry.register(APPLAUD);
  if (!registry.has(TAKE_HANDS.id)) registry.register(TAKE_HANDS);

  const timeline = createTimeline(registry);
  const specs = hallSpecs(hall);
  let formation: Formation = formationOf(library, danceOf(library, program.items[0]!.dance));
  // `hall` says where each set stands and how many couples it holds; which
  // formation it happens to be seated in is not the decider's to assume, so it
  // seats the first item's formation itself. Every *later* formation change is
  // caught by the line-up between two dances (`emitLineUp`), but the first
  // dance has no line-up before it — and a hall seated in one formation and
  // partitioned by another does not throw: it silently finds a set's couples
  // in the wrong places and calls every one of them an out, so the whole hall
  // dances `wait-out` for the length of the dance and nothing that was called
  // is danced at all.
  let state: HallState = createHall(formation, specs);
  const at: ScriptPosition = { itemIndex: 0, timeThrough: 0, beat: opts.startBeat };
  /** Where the last figure emitted leaves each dancer. */
  const standingAt = new Map<DancerId, EndPose>();
  let groupSeq = 0;

  const emitFigure = (
    into: TimelineEvent[],
    group: Group,
    def: AnyFigureDef,
    params: object & { beats: Beat },
    stations: readonly StationId[],
    start: Beat,
  ): void => {
    if (stations.length === 0) return;
    const bindings: Record<StationId, DancerId> = {};
    for (const id of stations) {
      const dancer = group.members[id];
      if (dancer === undefined)
        throw new Error(`group "${group.id}" has nobody on station "${id}"`);
      bindings[id] = dancer;
    }
    const event: TimelineEvent = {
      kind: "figure",
      group: group.id,
      figure: def.id,
      params,
      bindings,
      start,
      end: start + params.beats,
    };
    timeline.add(event);
    into.push(event);

    const ends = def.ends(group, params);
    for (const [id, dancer] of Object.entries(bindings)) {
      const end = ends[id];
      if (end) standingAt.set(dancer, end);
    }
  };

  const say = (into: TimelineEvent[], text: string, start: Beat, end: Beat): void => {
    const event: TimelineEvent = {
      kind: "utterance",
      speaker: "caller",
      text,
      start: Math.max(opts.startBeat, start),
      end,
    };
    timeline.add(event);
    into.push(event);
  };

  /** A fresh instance of one plan, registered on the timeline. */
  const mintGroup = (plan: GroupPlan): Group => {
    const group = createGroup({ ...plan, id: `${plan.id}#${groupSeq++}` }, formation.roleSet);
    timeline.addGroup(group);
    return group;
  };

  /**
   * The whole hall's ordinary minor-set partition, registered on the timeline.
   *
   * What everything *between* two dances runs in — the applause, the standing
   * about, the walk to the next dance's places. Those are not figure calls and
   * have no selector of their own: everybody is in the group they would dance
   * the next time through in.
   */
  const planGroups = (): Array<{ set: SetState; plan: GroupPlan; group: Group }> => {
    const out: Array<{ set: SetState; plan: GroupPlan; group: Group }> = [];
    for (const set of state.sets) {
      for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
        out.push({ set, plan, group: mintGroup(plan) });
      }
    }
    return out;
  };

  /** Where the last figure left each of a group's dancers, in world px. */
  const originsOf = (group: Group): Record<StationId, EndPose> => {
    const origins: Record<StationId, EndPose> = {};
    for (const station of group.stations) {
      const here = standingAt.get(group.members[station.id]!);
      if (here) origins[station.id] = here;
    }
    return origins;
  };

  /** Say each text in turn, sharing `beats` out evenly between them. */
  const sayEach = (
    into: TimelineEvent[],
    texts: readonly string[],
    start: Beat,
    beats: Beat,
  ): void => {
    if (texts.length === 0 || beats <= 0) return;
    const each = beats / texts.length;
    texts.forEach((text, i) => say(into, text, start + i * each, start + (i + 1) * each));
  };

  /**
   * One time through of `dance`, starting at `at.beat`.
   *
   * Every call resolves its own groups — `formation.groupsFor(call.group, set)`
   * against the *whole* set, not against one pre-selected group — so two calls
   * of the same dance may draw their dancers from different widths. Today every
   * call says `"hands-four"` and every partition is therefore the same one, but
   * it is computed call by call rather than once, because that is the shape a
   * call that reaches past its own four needs.
   *
   * Couples standing out go through the same loop as everybody else. A call
   * whose partition includes them dances them, exactly like a dancing couple;
   * whatever of their time through nothing claims is filled with `wait-out`
   * afterwards. With only `"hands-four"` to resolve, nothing ever claims them
   * and the fill is the whole cycle — one `wait-out`, the way it has always
   * been — but by the general path rather than a special case.
   */
  const emitCycle = (into: TimelineEvent[], dance: Dance, first: boolean): Beat => {
    const cycle = danceBeats(dance);
    const start = at.beat;
    const schedule = danceSchedule(dance);
    /** Which beats of this cycle each dancer has already been given a figure for. */
    const claimed = new Map<DancerId, Span[]>();
    const claim = (dancers: Iterable<DancerId>, from: Beat, to: Beat): void => {
      for (const dancer of dancers) {
        const spans = claimed.get(dancer) ?? [];
        spans.push([from, to]);
        claimed.set(dancer, spans);
      }
    };

    // Every figure this cycle produces — a call's own dancers, a call's
    // resting complement, and (once every call is known) a waiting couple's
    // gap fill — is recorded here rather than emitted straight away, and run
    // in beat order once the whole cycle is known. `Timeline.add()` requires
    // each dancer's own events to arrive in non-decreasing start order; a
    // waiting couple's *leading* gap (beat 0) is only discoverable after
    // every call has been walked (M2's sweep may claim its later beats), by
    // which point an ordinary run-as-you-go loop would already have added
    // that later call's event — arriving before the gap that precedes it.
    // Sorting the whole cycle's emissions by their own start beat, stably (so
    // same-beat calls keep the schedule's own order), is what keeps every
    // dancer's own sequence chronological regardless of which pass found it.
    const pending: Array<{ at: Beat; run: () => void }> = [];

    for (const { call, start: offset } of schedule) {
      const selector = call.group ?? HANDS_FOUR_GROUP;
      for (const set of state.sets) {
        for (const plan of formation.groupsFor(selector, set)) {
          // A group this call's partition left standing out: nobody dances the
          // call here, and the beats go to the fill below.
          if (plan.kind !== "set") continue;
          const group = mintGroup(plan);
          const def = registry.get(call.figure);
          const params = withDefaults(def, call.params, call.beats);
          const named = resolveSelector(call.who, formation, selector, group.stations);
          const denied = excludedByEnds(formation, selector, call.ends, group.stations);
          // A station `ends` denies is not merely left out of `who` — it is
          // not part of this call *at all*: a `down-the-hall`-shaped call
          // (`ends: "bottom"`) must leave a `wait-top` couple in the widened
          // group's own partition untouched by this call's beats entirely, not
          // standing through them, so the fill below still sees their whole
          // cycle unclaimed and gives them one ordinary wait-out — exactly as
          // if `groupsFor` had never widened toward that end for this call.
          const active = group.stations.filter((s) => !denied.has(s.id));
          const selected = named.filter((id) => !denied.has(id));
          const resting = complementOf(active, selected);
          pending.push({
            at: offset,
            run: () => {
              emitFigure(into, group, def, params, selected, start + offset);
              if (resting.length > 0) {
                const origins: Record<StationId, EndPose> = {};
                for (const id of resting) {
                  const here = standingAt.get(group.members[id]!);
                  if (here) origins[id] = here;
                }
                const stand = withDefaults(WALK_TO_STATION, { origins }, call.beats);
                emitFigure(into, group, WALK_TO_STATION, stand, resting, start + offset);
              }
            },
          });
          claim(
            active.map((s) => group.members[s.id]!),
            offset,
            offset + call.beats,
          );
        }
      }
    }

    // Whatever the schedule did not claim: the outs wait it out, in their own
    // resting group. `Timeline.add()` will not have a dancer in two figures at
    // once, so what is left has to be the *gaps* — never the whole cycle laid
    // over a call that swept them in.
    for (const set of state.sets) {
      for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
        if (plan.kind === "set") continue;
        const group = mintGroup(plan);
        // The registry's `wait-out`, not the built-in: a form may register its
        // own under the same id (contra does, to choose the crossing from the
        // formation), and taking the definition from the import would sample
        // one figure and record the other's `ends` — which the eight-beat
        // line-up between two dances then walks to, 51 px out.
        const def = registry.get(WAIT_OUT.id);
        // Untouched by any call this cycle (every dance before M2, and every
        // waiting couple no `"line"` call swept in): keep the fill sorting
        // *after* every ordinary call, exactly as it always has, rather than
        // at its own `at: 0` — nothing here depends on the order between two
        // gap fills of *different* dancers, but `timeline.dancers()`'s
        // insertion order does, and the motion report breaks ties by it
        // (M1's own finding). Only a genuinely swept couple — where the sort
        // key actually has to seam a gap in beside the call that produced it
        // for `Timeline.add()`'s sake — sorts by its own beat.
        const swept = Object.values(group.members).some((d) => claimed.has(d));
        for (const [from, to] of gapsIn(cycle, Object.values(group.members), claimed)) {
          // `startPlaces` matters only for a dance that progresses in its own
          // first figure: the waiting couple slides off the end of the line with
          // everybody else, so its crossing has to be reckoned from the place it
          // slid out of. Empty — every other dance — is the waiting place, which
          // is what `wait-out` did before there was a parameter at all.
          //
          // A `"line"`-selector call may have swept this couple in for part of
          // the cycle (M2), leaving the gaps here as leading and/or trailing
          // remainders rather than the whole cycle: `join` only makes sense for
          // a gap that opens at the couple's own beat 0 (nothing claimed them
          // before it) and `cross` only for one that runs to the cycle's own
          // end (nothing claims them after it) — a gap in the middle, between
          // two sweeps, does neither. With only `"hands-four"` ever resolved
          // here (M1), every waiting couple's only gap is still `[0, cycle)`
          // and both stay `true`, which is today's only behaviour, unchanged.
          const params = withDefaults(
            def,
            {
              startPlaces: dance.startPlaces ?? {},
              join: from === 0,
              cross: to === cycle,
              ...(dance.waitOut ?? {}),
            },
            to - from,
          );
          pending.push({
            at: swept ? from : Number.POSITIVE_INFINITY,
            run: () =>
              emitFigure(into, group, def, params, Object.keys(group.members), start + from),
          });
        }
      }
    }

    // Stable: `Array.prototype.sort` preserves the relative order of equal
    // keys, so every same-beat tie keeps the order the two passes above
    // already found it in.
    for (const p of [...pending].sort((a, b) => a.at - b.at)) p.run();

    // The caller says each call once for the whole hall, not once per group.
    //
    // The **first call of a dance** is the one exception to a figure's own
    // `lead`: a caller says the first move over the potatoes, so the hall hears
    // "balance and swing" two beats before beat 1 (the user's own "2 potatoes
    // and then 'balance and swing'"). Every later call, and every later time
    // through, keeps the lead its figure asks for — pacing the calls is the
    // calls-in-rhythm milestone's job, not this one's.
    //
    // How long the call itself lasts is C3's own arithmetic: it runs from
    // `lead` beats early for however long the words take to say
    // (`call.spokenBeats`, then `def.spokenBeats`, then the rhythm estimate,
    // in that order — the dance's own number wins, then the figure's, then a
    // guess from the text) plus a short tail, not a fixed two beats regardless
    // of the words. "The calls stay around too long... they should stay
    // around either how many beats they are, or maybe 1 or 2 beats past. but
    // not until the next call" (the user, 2026-09-14).
    //
    // The spoken length is measured from where the utterance actually starts
    // being heard, `Math.max(opts.startBeat, leadStart)` — not the raw,
    // possibly-negative `leadStart` a short first call at the very start of
    // the programme can have. A programme that opens on a dance whose first
    // call is short enough that `spokenBeats + tail ≤ lead` (Butter's own
    // "SHIFT LEFT", said with the two-beat `firstCallLeadBeats`) would
    // otherwise end the utterance at or before beat 0 — a zero- or
    // negative-length window nobody ever hears, on the very first call of the
    // evening.
    for (const { call, start: offset } of schedule) {
      const def = registry.get(call.figure);
      const text = call.call ?? def.call;
      const lead = first && offset === 0 ? opts.firstCallLeadBeats : def.lead;
      const uttStart = Math.max(opts.startBeat, start + offset - lead);
      const spoken = call.spokenBeats ?? def.spokenBeats ?? spokenBeats(text);
      say(into, text, uttStart, uttStart + spoken + opts.utteranceTailBeats);
    }

    at.beat = start + cycle;
    state = { sets: state.sets.map((set) => formation.progression.next(set)) };
    return cycle;
  };

  /**
   * The applause: the hall stops where it is, turns to the band and claps.
   *
   * Danced in the formation just finished, before any re-seating, because the
   * dancers are still standing where that dance left them. `face` comes from
   * the **set** frame rather than the group's: a group at the bottom end of a
   * becket line runs in a frame turned end for end, and those dancers would
   * applaud the back wall.
   */
  const emitApplause = (into: TimelineEvent[]): void => {
    if (opts.applauseBeats <= 0) return;
    const start = at.beat;
    const def = registry.get(APPLAUD.id);
    for (const { set, group } of planGroups()) {
      const params = withDefaults(
        def,
        { origins: originsOf(group), face: set.frame.axis + 180 },
        opts.applauseBeats,
      );
      emitFigure(into, group, def, params, Object.keys(group.members), start);
    }
    sayEach(into, opts.applauseCalls, start, opts.applauseBeats);
    at.beat = start + opts.applauseBeats;
  };

  /** Everybody stands where they are for `beats`, so the timeline stays covered. */
  const emitStand = (into: TimelineEvent[], beats: Beat): void => {
    if (beats <= 0) return;
    const start = at.beat;
    for (const { group } of planGroups()) {
      const params = withDefaults(WALK_TO_STATION, { origins: originsOf(group) }, beats);
      emitFigure(into, group, WALK_TO_STATION, params, Object.keys(group.members), start);
    }
    at.beat = start + beats;
  };

  /**
   * The walk to where the hall stands to take hands four.
   *
   * Not, any more, to the next dance's own first places: a formation whose
   * progression runs sideways lines up **improper** and is shifted one place
   * round the ring afterwards (the user's "you still line up improper"), so the
   * walk's target is every station's place turned back round the ring by the
   * shift it is about to make. With no shift that is the stations themselves,
   * which is what it always was.
   */
  const emitWalk = (into: TimelineEvent[], shift: LineUpShift): void => {
    if (opts.lineUpBeats <= 0) return;
    const start = at.beat;
    const places = shiftPlaces(shift);
    for (const { plan, group } of planGroups()) {
      const to: Record<StationId, StationId> = {};
      for (const station of group.stations) to[station.id] = station.id;
      const endPlaces = lineUpPlaces(
        group.stations,
        // A couple waiting out at the end of a line has nobody to shift with:
        // it takes hands where it stands.
        plan.kind === "set" ? places : 0,
        group.frame.spacing,
      );
      const params = withDefaults(
        WALK_TO_STATION,
        { origins: originsOf(group), to, endPlaces },
        opts.lineUpBeats,
      );
      emitFigure(into, group, WALK_TO_STATION, params, Object.keys(group.members), start);
    }
    at.beat = start + opts.lineUpBeats;
  };

  /**
   * Hands four, in a ring, held into the potatoes.
   *
   * One figure over two stretches: it steps in and takes hands over the first
   * beats of `ringBeats`, moves the ring one place round when the formation
   * asks, holds it through the first potatoes, and lets go and steps out on to
   * the next dance's own first places in time for beat 1. That is why it is
   * emitted once rather than twice — a ring released and retaken across a
   * stretch boundary would be exactly the "arms disappear at the seam" the
   * carried-hold work exists to stop.
   */
  const emitRing = (into: TimelineEvent[], next: Dance, shift: LineUpShift): void => {
    const beats = opts.ringBeats + opts.readyBeats;
    if (beats <= 0) return;
    const start = at.beat;
    const def = registry.get(TAKE_HANDS.id);
    const places = shiftPlaces(shift);
    const endPlaces = next.startPlaces ?? {};
    for (const { plan, group } of planGroups()) {
      const params = withDefaults(
        def,
        {
          origins: originsOf(group),
          endPlaces,
          places: plan.kind === "set" ? places : 0,
          turnBeats: opts.ringBeats - RING_IN_BEATS,
        },
        beats,
      );
      emitFigure(into, group, def, params, Object.keys(group.members), start);
    }
    at.beat = start + beats;
  };

  /**
   * The whole gap between two dances: applause, announcement, walk, hands four
   * in a ring, potatoes.
   *
   * The re-seating that a formation change needs happens between the applause
   * and the announcement — after the hall has finished clapping in the
   * formation it danced, and before the caller says the words that get it
   * standing in the new one.
   */
  const emitBetweenDances = (into: TimelineEvent[], next: Dance): void => {
    emitApplause(into);

    const nextFormation = formationOf(library, next);
    if (nextFormation.id !== formation.id) {
      state = createHall(nextFormation, specs);
      formation = nextFormation;
    }

    // Which way — if any — this formation's hall moves once it has taken hands
    // four, read off its own progression rather than out of a table. A set is
    // needed to measure against; any of the hall's will do, and one seated in
    // this formation is exactly what `state` now holds.
    const shift: LineUpShift = state.sets[0] ? lineUpShiftOf(formation, state.sets[0]) : null;

    // The announcement: the title and author, then the words that get the hall
    // standing for it, one bubble each over the announcement's beats.
    const announceStart = at.beat;
    emitStand(into, opts.announceBeats);
    sayEach(
      into,
      [nextDanceCall(next), ...(formation.lineUpCalls ?? opts.lineUpCalls)],
      announceStart,
      opts.announceBeats,
    );

    // The shift's own words run over the walk and the ring together — which is
    // when a caller says them, with the hall already moving — rather than over
    // the announcement, where they would have to share sixteen beats with the
    // title and cost every bubble half its reading time.
    const handsFourStart = at.beat;
    emitWalk(into, shift);
    emitRing(into, next, shift);
    sayEach(
      into,
      formation.handsFourCalls?.(shift) ?? [],
      handsFourStart,
      opts.lineUpBeats + opts.ringBeats,
    );

    // "HERE WE GO" over the first potatoes, and **off** the bubble by the time
    // the dance's own first call takes it (`emitCycle`'s `firstCallLeadBeats`).
    // The bubble shows whichever call started first among those still running
    // (`callAt` in `apps/web`), so a "here we go" that outlasted the first
    // figure's call would sit on top of it for the two beats the hall most
    // needs to read it.
    const readyStart = at.beat - opts.readyBeats;
    const readyEnd = at.beat - opts.firstCallLeadBeats;
    if (opts.readyBeats > 0 && readyEnd > readyStart) {
      say(into, opts.readyCall, readyStart, readyEnd);
    }
  };

  /** One time through plus, when the dance is ending, the switch to the next. */
  const emitNext = (into: TimelineEvent[]): void => {
    const item = program.items[at.itemIndex]!;
    const dance = validateDance(danceOf(library, item.dance));
    const thisFormation = formationOf(library, dance);
    if (thisFormation.id !== formation.id) {
      state = createHall(thisFormation, specs);
      formation = thisFormation;
    }

    emitCycle(into, dance, at.timeThrough === 0);

    at.timeThrough += 1;
    if (at.timeThrough < item.timesThrough) return;

    at.timeThrough = 0;
    at.itemIndex = (at.itemIndex + 1) % program.items.length;
    const next = danceOf(library, program.items[at.itemIndex]!.dance);
    if (next.slug === dance.slug) return;

    emitBetweenDances(into, next);
  };

  return {
    timeline: (): Timeline => timeline,
    covered: () => (timeline.dancers().length === 0 ? opts.startBeat : timeline.covered()),
    advance(until) {
      const produced: TimelineEvent[] = [];
      let guard = 0;
      while (at.beat <= until) {
        emitNext(produced);
        if (++guard > MAX_CYCLES) throw new Error(`decider made no progress toward beat ${until}`);
      }
      return produced;
    },
  };
}

/**
 * How the caller names the next dance, in the bubble: the title and who wrote
 * it. Sixteen columns wide, so it wraps to two or three lines.
 */
export const nextDanceCall = (next: Dance): string =>
  `NEXT: ${next.title.toUpperCase()}, BY ${next.author.toUpperCase()}`;

/**
 * The stations `call.ends` (default `"both"`) says this call does not reach.
 *
 * A widened group — `"line"`'s widest shape, or any formation-defined
 * selector shaped like it — carries a waiting couple's stations tagged
 * `"wait-top"`/`"wait-bottom"` (the same two names `GroupPlan.kind`'s own two
 * outs already use, not a new vocabulary), so a call can say which of the
 * true ends it is actually willing to widen into without a second selector
 * value: `ends` lives on the call, the widest partition `groupsFor` can build
 * lives on the formation, per plan.md's "the widest partition regardless,
 * `ends` decides whether *this* call uses it." A call that leaves `ends` at
 * its default excludes nothing and never even asks the formation for the
 * tags, so a formation that never widens anything needs to define neither.
 */
function excludedByEnds(
  formation: Formation,
  selector: GroupSelector,
  ends: "both" | "top" | "bottom" | undefined,
  stations: readonly Station[],
): Set<StationId> {
  if (ends === undefined || ends === "both") return new Set();
  const tags = formation.tags(selector);
  const denied = ends === "top" ? tags["wait-bottom"] : tags["wait-top"];
  const ids = new Set(stations.map((s) => s.id));
  return new Set((denied ?? []).filter((id) => ids.has(id)));
}

/**
 * Beats the hall spends stepping in to the ring before it starts to turn.
 *
 * {@link TAKE_HANDS}' own default, named here because the decider has to take
 * it off the shift's beats: the shift is "the rest of the hands-four stretch
 * once everybody has hands".
 */
const RING_IN_BEATS: Beat = 2;

/** A runaway guard: no program needs this many times through to reach a beat. */
const MAX_CYCLES = 10_000;

/** A half-open run of beats, measured from the start of a time through. */
type Span = readonly [Beat, Beat];

/**
 * The beats of `[0, cycle]` that no call gave any of `dancers` a figure for.
 *
 * A group whose dancers nothing claimed gets one gap, the whole cycle, which is
 * what every waiting couple has always had. A group a call swept in for part of
 * the time through gets the leading and trailing remainders instead — never an
 * overlap, which `Timeline.add()` would throw on anyway.
 *
 * The claims of a group's dancers are pooled: a call takes a whole group or
 * none of it, so they agree, and pooling means a couple whose two dancers were
 * somehow claimed differently produces a gap neither of them can dance rather
 * than a silent overlap for one of them.
 */
function gapsIn(cycle: Beat, dancers: readonly DancerId[], claimed: Map<DancerId, Span[]>): Span[] {
  const spans: Span[] = [];
  for (const dancer of dancers) spans.push(...(claimed.get(dancer) ?? []));
  if (spans.length === 0) return [[0, cycle]];

  const gaps: Span[] = [];
  let at: Beat = 0;
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (from > at) gaps.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < cycle) gaps.push([at, cycle]);
  return gaps;
}

/**
 * The specs a hall's sets were built from, so a formation change can re-seed
 * them.
 *
 * `createHall` records each set's own spec, and that is what is used when it is
 * there: a formation may seat its frame somewhere other than `spec.centre`
 * (becket does, by a waiting place and a half), so reading the spec back off
 * the frame would move the set by that offset every time the formation changed.
 * The fallback is for a set built by hand, where the frame is all there is.
 */
const hallSpecs = (hall: HallState): SetSpec[] =>
  hall.sets.map(
    (set) =>
      set.spec ?? {
        id: set.id,
        couples: set.couples.length,
        centre: set.frame.centre,
        axis: set.frame.axis,
      },
  );
