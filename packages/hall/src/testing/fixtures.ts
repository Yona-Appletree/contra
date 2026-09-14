import type { Hand, PoseSample, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  SHOULDER_WIDTH_PX,
  bodyPoint,
  leftOf,
  lerp,
  shouldersAt,
} from "@caller/core";
import { drawBubble } from "../bubble/drawBubble.js";
import type { BlitCtx2D } from "../floor/drawFloor.js";
import { drawFloor } from "../floor/drawFloor.js";
import { FONT } from "../font/Font.js";
import { drawFurniture } from "../furniture/drawFurniture.js";
import { createPerson } from "../person/Person.js";
import type { Frame, FrameDancer } from "../renderer/Frame.js";
import type { Renderer } from "../renderer/Renderer.js";
import type { World } from "../renderer/World.js";
import { DEFAULT_WORLD } from "../renderer/World.js";
import type { HallWorld } from "../world/layoutHall.js";
import { layoutHall } from "../world/layoutHall.js";

/**
 * Static frames with fixed seeds and no animation, so a screenshot of one is
 * the same on every machine and every run. These are what the golden frames
 * pin and what the stories show.
 */
export interface Fixture {
  name: string;
  /** One line on the page and in the story, saying what the frame is for. */
  description: string;
  world: World;
  frame: Frame;
  /**
   * Paint the floor layer before the frame is drawn. The dancer fixtures leave
   * it empty and sit on the backdrop; the hall fixtures paint the boards, the
   * walls, the band and the caller's bubble into it, which is the only thing
   * that makes a hall a hall.
   */
  paint?: (renderer: Renderer) => void;
}

/** The call the bubble golden says, so the director can read it at zoom 3. */
export const BUBBLE_CALL = "HANDS FOUR FROM THE TOP";

/** The contra role set's hand stacking: the robin's hand on top. */
export const CONTRA_ROLE_SET = { top: "robin" } as const;

/** Lateral offset of the two joined points in a two-hand hold. From the spike. */
const HOLD_LATERAL_PX = 4.5;
/** How far below shoulder height joined hands sit in a two-hand hold. */
const HOLD_DROP_PX = 5;

/** The swing's hand heights and the geometry of the pair, from the spike's `figSwing`. */
const SWING_RADIUS_PX = 5;
const SWING_OFFSET_PX = 3.5;
const SWING_OPEN_HAND_PX = 5;

/** A pose with everything the renderer needs and nothing happening. */
function restingPose(
  p: Vec2,
  facing: number,
  look = facing,
  extra: Partial<PoseSample> = {},
): PoseSample {
  return {
    p,
    facing,
    look,
    lean: 0,
    hands: { L: "down", R: "down" },
    stepRate: 1,
    buzz: false,
    flare: 0,
    amp: 1,
    ...extra,
  };
}

/**
 * One person seen from each of eight facings, laid out in a 4 × 2 grid: the
 * frame that says whether the procedural body reads as a body pointing
 * somewhere, from every angle.
 */
function facingsFixture(): Fixture {
  const people: FrameDancer[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const p: Vec2 = [-45 + col * 30, -18 + row * 34];
    people.push({
      person: createPerson({ id: `d${i}`, role: "lark", seed: 34 + i, skirt: i % 2 === 1 }),
      pose: restingPose(p, i * 45),
    });
  }
  return {
    name: "facings",
    description: "One dancer at each of the eight facings, 45° apart.",
    world: { ...DEFAULT_WORLD },
    frame: { beat: 0, people, roleSet: CONTRA_ROLE_SET },
  };
}

/**
 * Two dancers holding two hands at the contract's 14 px, straight off the
 * two-dancers spike's `figWalkIn` with the take complete: both joined points
 * are one shared floor point, so the arms have to meet.
 */
function twoHandHoldFixture(): Fixture {
  const centre: Vec2 = [0, 0];
  const half = HOLD_SPACING_PX / 2;
  const people: FrameDancer[] = (
    [
      ["lark", -1, 0, 601],
      ["robin", 1, 180, 707],
    ] as const
  ).map(([role, sign, facing, seed]) => {
    const p: Vec2 = [sign * half, 0];
    const side = leftOf(facing);
    const hands = {
      L: joined(centre, side, HOLD_LATERAL_PX),
      R: joined(centre, side, -HOLD_LATERAL_PX),
    };
    return {
      person: createPerson({
        id: role,
        role,
        seed,
        skirt: role === "robin",
        roleShirts: CONTRA_ROLE_SET,
      }),
      pose: restingPose(p, facing, facing, { hands }),
    };
  });
  return {
    name: "two-hand-hold",
    description: `Two dancers holding two hands at ${HOLD_SPACING_PX} px chest to chest.`,
    world: { ...DEFAULT_WORLD },
    frame: { beat: 0, people, roleSet: CONTRA_ROLE_SET },
  };
}

/**
 * A swing, held at the moment both dancers are fully into it: right shoulders
 * together, the outside hands joined out to the side and the inside hands on
 * the other's back. Ported from the two-dancers spike's `figSwing` at
 * `into = 1, open = 0`, with the spike's `psi = 0`.
 *
 * This is the fixture that shows the stacking invariant: the robin's hand is on
 * top of the lark's at the joined point and the robin's arms draw over the
 * lark's.
 */
function swingFixture(): Fixture {
  const psi = 0;
  const along: Vec2 = [Math.cos(0), Math.sin(0)];
  const side = leftOf(psi);
  const larkP: Vec2 = at(at([0, 0], along, -SWING_RADIUS_PX), side, SWING_OFFSET_PX);
  const robinP: Vec2 = at(at([0, 0], along, SWING_RADIUS_PX), side, -SWING_OFFSET_PX);
  const larkA = psi - 30;
  const robinA = psi + 180 - 30;

  // The joined outside hands: midway between the two outside shoulders, then
  // out to the side, at nearly shoulder height.
  const larkShoulder = shouldersAt(larkP, larkA).L;
  const robinShoulder = shouldersAt(robinP, robinA).R;
  const mid = lerp(larkShoulder, robinShoulder, 0.5);
  const outside: Hand = { p: at(mid, side, SWING_OPEN_HAND_PX), drop: 1 };
  // The inside hands: each on the other dancer's back.
  const larkRight: Hand = { p: bodyPoint(robinP, robinA, -1.5, -2.5), drop: 1 };
  const robinLeft: Hand = { p: bodyPoint(larkP, larkA, 0, SHOULDER_WIDTH_PX / 2 - 0.5), drop: 0 };

  const people: FrameDancer[] = [
    {
      person: createPerson({
        id: "lark",
        role: "lark",
        seed: 601,
        skirt: false,
        roleShirts: CONTRA_ROLE_SET,
      }),
      pose: restingPose(larkP, larkA, robinA + 180, {
        hands: { L: outside, R: larkRight },
        lean: -0.6,
        stepRate: 2,
        buzz: true,
      }),
    },
    {
      person: createPerson({
        id: "robin",
        role: "robin",
        seed: 707,
        // No skirt: a flared skirt at this radius covers the lark, and the
        // point of this fixture is the arms. `facings` exercises skirts.
        skirt: false,
        roleShirts: CONTRA_ROLE_SET,
      }),
      pose: restingPose(robinP, robinA, larkA + 180, {
        hands: { L: robinLeft, R: outside },
        lean: -0.6,
        stepRate: 2,
        buzz: true,
        flare: 2.6,
      }),
    },
  ];
  return {
    name: "swing",
    description: "A swing held mid-figure: the robin's arms over the lark's.",
    world: { ...DEFAULT_WORLD },
    frame: { beat: 1, people, roleSet: CONTRA_ROLE_SET },
  };
}

/** The demo's hall: two lines, five couples and four. */
export const DEMO_HALL: HallWorld = layoutHall({ lines: 2, couplesPerLine: [5, 4] });

/**
 * The hall with nobody dancing in it: boards, walls, stage, band, caller,
 * chairs, sitters and the snack table, and not one dancer. This is the frame
 * that says whether the world reads as a hall before anybody is in it.
 */
function emptyHallFixture(): Fixture {
  return {
    name: "hall-empty-2-lines",
    description: "Two lines, five couples and four, with nobody dancing yet.",
    world: { ...DEMO_HALL.world },
    frame: { beat: 0, people: [], roleSet: CONTRA_ROLE_SET },
    paint: (renderer) => paintHall(renderer, false),
  };
}

/** The same hall with the caller calling, so the bubble can be read at zoom 3. */
function hallBubbleFixture(): Fixture {
  return {
    name: "hall-bubble",
    description: `The caller calling "${BUBBLE_CALL}" in the bitmap font.`,
    world: { ...DEMO_HALL.world },
    frame: { beat: 0, people: [], roleSet: CONTRA_ROLE_SET },
    paint: (renderer) => paintHall(renderer, true),
  };
}

function paintHall(renderer: Renderer, bubble: boolean): void {
  const g = renderer.layers.floor.getContext("2d") as BlitCtx2D | null;
  if (g === null) return;
  drawFloor(g, DEMO_HALL, "grange");
  drawFurniture(g, DEMO_HALL, 0);
  if (bubble) {
    // Anchored on the caller's head, which is where the tail has to land.
    drawBubble(g, FONT, BUBBLE_CALL, DEMO_HALL.caller, { world: DEMO_HALL.world });
  }
}

const joined = (centre: Vec2, side: Vec2, lateral: number): Hand => ({
  p: at(centre, side, lateral),
  drop: HOLD_DROP_PX,
});

const at = (p: Vec2, v: Vec2, k: number): Vec2 => [p[0] + v[0] * k, p[1] + v[1] * k];

/** Every fixture, by name. */
export const FIXTURES: Readonly<Record<string, Fixture>> = Object.freeze(
  Object.fromEntries(
    [
      facingsFixture(),
      twoHandHoldFixture(),
      swingFixture(),
      emptyHallFixture(),
      hallBubbleFixture(),
    ].map((f) => [f.name, f]),
  ),
);

/** Fixture names in a stable order — what the golden test iterates. */
export const FIXTURE_NAMES: readonly string[] = Object.keys(FIXTURES);

/** Look one up, with a useful error rather than `undefined`. */
export function fixture(name: string): Fixture {
  const f = FIXTURES[name];
  if (f === undefined) {
    throw new Error(`hall: no fixture named "${name}" (have ${FIXTURE_NAMES.join(", ")})`);
  }
  return f;
}
