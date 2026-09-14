import type { StationId } from "@caller/choreo";

/**
 * The two pairings the demo's dances need beyond `"partners"` and
 * `"neighbors"`: the two robins with each other, and the two larks.
 *
 * A caller says "ladies allemande right once and a half" or "gents do-si-do";
 * the figure library takes a pairing, and the named ones are the two pairs a
 * minor set dances in. These are the other two pairs the same four people can
 * make, written out once here rather than in every dance that calls them.
 */
export const ROBINS: readonly (readonly [StationId, StationId])[] = [["1R", "2R"]];

/** The two larks with each other. See {@link ROBINS}. */
export const LARKS: readonly (readonly [StationId, StationId])[] = [["1L", "2L"]];
