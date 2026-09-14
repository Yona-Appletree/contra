import { describe, expect, it } from "vitest";
import { SQUARE, SQUARE_HEADS, squareStations } from "../testing/square.js";
import { complementOf, resolveSelector } from "./resolveSelector.js";

const stations = squareStations();

describe("resolving a selector", () => {
  it("takes everybody by default and for 'all'", () => {
    expect(resolveSelector(undefined, SQUARE, stations)).toHaveLength(8);
    expect(resolveSelector("all", SQUARE, stations)).toHaveLength(8);
  });

  it("takes the stations an array names", () => {
    expect(resolveSelector(["1L", "3R"], SQUARE, stations)).toEqual(["1L", "3R"]);
  });

  it("refuses an array that names a station the group does not have", () => {
    expect(() => resolveSelector(["1L", "9Z"], SQUARE, stations)).toThrow(/"9Z"/);
  });

  it("asks the formation what its own tags mean", () => {
    expect(resolveSelector("heads", SQUARE, stations)).toEqual(SQUARE_HEADS);
    expect(resolveSelector("larks", SQUARE, stations)).toHaveLength(4);
  });

  it("refuses a tag the formation does not define, rather than selecting nobody", () => {
    // A dance that says `who: 'ones'` in a square is a bug in the dance.
    expect(() => resolveSelector("ones", SQUARE, stations)).toThrow(/no tag "ones"/);
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
