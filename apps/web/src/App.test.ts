import { describe, expect, it } from "vitest";
import { danceSlug, moveTracesId, tracesSlug } from "./App.js";

describe("danceSlug (U3: #/dances/<slug>, the dance page)", () => {
  it("names the slug of a plain dance path", () => {
    expect(danceSlug("/dances/airpants")).toBe("airpants");
  });

  it("is undefined for the bare list route", () => {
    expect(danceSlug("/dances")).toBeUndefined();
    expect(danceSlug("/dances/")).toBeUndefined();
  });

  it("is undefined for the traces route, which has a third segment", () => {
    expect(danceSlug("/dances/airpants/traces")).toBeUndefined();
  });

  it("is undefined for the Stage's singular route and for Moves paths", () => {
    expect(danceSlug("/dance/airpants")).toBeUndefined();
    expect(danceSlug("/moves/airpants")).toBeUndefined();
    expect(danceSlug("/moves")).toBeUndefined();
  });
});

// tracesSlug and moveTracesId predate U3; asserted here too so the three
// three-way-mirrored route helpers are proved apart in one place.
describe("tracesSlug and moveTracesId still agree with danceSlug's boundaries", () => {
  it("tracesSlug wants exactly three segments ending in /traces", () => {
    expect(tracesSlug("/dances/airpants/traces")).toBe("airpants");
    expect(tracesSlug("/dances/airpants")).toBeUndefined();
  });

  it("moveTracesId wants exactly three segments under /moves ending in /traces", () => {
    expect(moveTracesId("/moves/hey/traces")).toBe("hey");
    expect(moveTracesId("/moves/hey")).toBeUndefined();
  });
});
