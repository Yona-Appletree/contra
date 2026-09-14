// @caller/hall — the pixel-hall renderer. Reads pose samples and draws them;
// never calls a figure. See README.md for the contract these exports implement.

// the renderer
export type { Renderer, RendererOptions } from "./renderer/Renderer.js";
export { SUPERSAMPLE, createRenderer } from "./renderer/Renderer.js";
export type { World } from "./renderer/World.js";
export { BACKDROP_COLOUR, DEFAULT_WORLD, assertWorld } from "./renderer/World.js";
export type { Frame, FrameDancer } from "./renderer/Frame.js";
export type { Ctx2D } from "./renderer/Ctx2D.js";
export { OUTLINE_COLOUR, circ, ell, seg } from "./renderer/Ctx2D.js";
export type { OrderedDancer, SceneOrder } from "./renderer/sceneOrder.js";
export { JOIN_EPSILON_PX, sceneOrder } from "./renderer/sceneOrder.js";

// people
export type { Person, PersonSpec } from "./person/Person.js";
export { TRAIL_COLOURS, createPerson, roleTrailColour } from "./person/Person.js";
export type { ArmPair, DancerLayout } from "./person/layoutDancer.js";
export {
  HAND_HANG_DROP_PX,
  HAND_HANG_FORWARD_PX,
  HAND_HANG_LATERAL_PX,
  HAND_HANG_SWING_PX,
  hangingHand,
  layoutDancer,
} from "./person/layoutDancer.js";
export type { DrawOptions, HandStack } from "./person/drawPerson.js";
export {
  HAND_STACK_RADIUS_PX,
  SHADOW_COLOUR,
  drawArms,
  drawBody,
  drawHead,
  drawPerson,
} from "./person/drawPerson.js";
export { HEAD_TURN_LIMIT_DEG, HEAD_TURN_RELEASE_DEG, headLook } from "./person/headLook.js";

// appearance
export type { Appearance, AppearanceOptions, HairStyle } from "./appearance/Appearance.js";
export {
  COOL_SHIRTS,
  HAIR_COLOURS,
  HAIR_STYLES,
  HAIR_STYLE_BAG,
  PANTS_COLOURS,
  SHIRT_COLOURS,
  SHOE_COLOUR,
  SKIN_TONES,
  SKIRT_COLOURS,
  WARM_SHIRTS,
  createAppearance,
} from "./appearance/Appearance.js";
export { mulberry32, pick } from "./appearance/mulberry32.js";
export { hexToRgb, shade } from "./appearance/shade.js";

// the hall itself: where everything stands, and what it is painted in
export type {
  BandInstrument,
  HallLayout,
  HallPerson,
  HallWorld,
  PropKind,
  SetGeometry,
  StageGeometry,
  TableGeometry,
} from "./world/layoutHall.js";
export {
  COUPLE_PITCH_PX,
  DEFAULT_HALL_SEED,
  FLOOR_TAIL_PX,
  FLOOR_TO_FIRST_COUPLE_PX,
  LINES_APART_PX,
  SET_PITCH,
  SIDE_W,
  STAGE_DEPTH_PX,
  STAGE_TO_FLOOR_PX,
  WALL_PX,
  layoutHall,
} from "./world/layoutHall.js";
export type { BlitCtx2D, HallPalette, HallTheme } from "./floor/drawFloor.js";
export { HALL_THEMES, clearFloorCache, drawFloor } from "./floor/drawFloor.js";
export {
  BAND_MOTION_PX,
  clearFurnitureLayer,
  drawFurniture,
  drawProp,
  posture,
} from "./furniture/drawFurniture.js";

// the bitmap font and the text drawn in it
export type { Font } from "./font/Font.js";
export { FONT, textHeight, textWidth } from "./font/Font.js";
export {
  CHAR_ADVANCE_PX,
  GLYPHS,
  GLYPH_H,
  GLYPH_W,
  LETTER_SPACING_PX,
  LINE_ADVANCE_PX,
  LINE_SPACING_PX,
  MISSING_GLYPH,
} from "./font/glyphs.js";
export { drawText } from "./font/drawText.js";

// the caller's speech bubble, drawn in that font
export type { BubbleBox, BubbleOptions } from "./bubble/drawBubble.js";
export {
  BUBBLE_BORDER,
  BUBBLE_INK,
  BUBBLE_MARGIN_PX,
  BUBBLE_MAX_COLS,
  BUBBLE_PADDING_PX,
  BUBBLE_PAPER,
  BUBBLE_SHADOW,
  BUBBLE_TAIL_PX,
  drawBubble,
  layoutBubble,
  wrapText,
} from "./bubble/drawBubble.js";

// trails
export type { TrailUpdate, Trails } from "./trails/Trails.js";
export {
  TRAIL_ALPHA,
  TRAIL_BREAK_PX,
  TRAIL_WIDTH_PX,
  createTrails,
  trailStrokes,
} from "./trails/Trails.js";

// fixtures for the golden frames and the stories
export type { Fixture } from "./testing/fixtures.js";
export { CONTRA_ROLE_SET, FIXTURES, FIXTURE_NAMES, fixture } from "./testing/fixtures.js";

/** Package identity, kept from the M1 scaffold smoke test. */
export const packageName = "@caller/hall";
