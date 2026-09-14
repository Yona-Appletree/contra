import { describe, expect, it } from "vitest";
import { HANDS_FOUR_GROUP } from "../formation/Formation.js";
import { SQUARE, SQUARE_HEADS, squareStations } from "../testing/square.js";
import { complementOf, resolveSelector } from "./resolveSelector.js";

const stations = squareStations();

describe("resolving a selector", () => {
  it("takes everybody by default and for 'all'", () => {
    expect(resolveSelector(undefined, SQUARE, HANDS_FOUR_GROUP, stations)).toHaveLength(8);
    expect(resolveSelector("all", SQUARE, HANDS_FOUR_GROUP, stations)).toHaveLength(8);
  });

  it("takes the stations an array names", () => {
    expect(resolveSelector(["1L", "3R"], SQUARE, HANDS_FOUR_GROUP, stations)).toEqual(["1L", "3R"]);
  });

  it("refuses an array that names a station the group does not have", () => {
    expect(() => resolveSelector(["1L", "9Z"], SQUARE, HANDS_FOUR_GROUP, stations)).toThrow(/"9Z"/);
  });

  it("asks the formation what its own tags mean", () => {
    expect(resolveSelector("heads", SQUARE, HANDS_FOUR_GROUP, stations)).toEqual(SQUARE_HEADS);
    expect(resolveSelector("larks", SQUARE, HANDS_FOUR_GROUP, stations)).toHaveLength(4);
  });

  it("refuses a tag the formation does not define, rather than selecting nobody", () => {
    // A dance that says `who: 'ones'` in a square is a bug in the dance.
    expect(() => resolveSelector("ones", SQUARE, HANDS_FOUR_GROUP, stations)).toThrow(
      /no tag "ones"/,
    );
  });

  it("asks for the tags of the call's own group, not of a station count", () => {
    // Two partitions can hand out groups of the same size, so the count cannot
    // say what a tag means; the selector the call ran in is what does.
    expect(() => resolveSelector("heads", SQUARE, "shadow-pair", stations)).toThrow(
      /no group selector "shadow-pair"/,
    );
  });

  it("names the stations a selection leaves standing", () => {
    expect(complementOf(stations, SQUARE_HEADS)).toEqual(["2L", "2R", "4L", "4R"]);
    expect(
      complementOf(
        stations,
        stations.map((s) => s.id),
      ),
    ).toEqual([]);
  });
});
