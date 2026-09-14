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
