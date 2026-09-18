import { describe, expect, it } from "vitest";
import { buildTree, findDance } from "./buildTree.js";
import { fixtures, withModule } from "./fixtures.js";
import { printTree } from "./printTree.js";
import { hallFacts } from "./runEvening.js";
import { placesUnder } from "./tree.js";

/**
 * The setup pass: `setup` runs once, for nobody, and what it leaves is the
 * floor — frames in millimetres, anchors as data, and one dancer per place.
 */
describe("buildTree", () => {
  it("lays becket's floor: two lines, three minor sets, a couple waiting at each end", () => {
    const program = fixtures();
    const built = buildTree(program, findDance(program, "butter")!, hallFacts({ "minor-sets": 3 }));
    expect(built.diagnostics).toEqual([]);
    expect(printTree(built.tree)).toMatchSnapshot();
  });

  it("names a dancer for where it started, and keeps the name", () => {
    const program = fixtures();
    const built = buildTree(program, findDance(program, "butter")!, hallFacts({ "minor-sets": 2 }));
    expect(built.tree.dancers.map((dancer) => dancer.id)).toEqual([
      "OT-1L",
      "OT-1R",
      "0-1L",
      "0-1R",
      "0-2L",
      "0-2R",
      "1-1L",
      "1-1R",
      "1-2L",
      "1-2R",
      "OB-2L",
      "OB-2R",
    ]);
  });

  it("fills every place: a hall of 2n + 2 couples", () => {
    const program = fixtures();
    for (const sets of [1, 2, 3]) {
      const built = buildTree(
        program,
        findDance(program, "butter")!,
        hallFacts({ "minor-sets": sets }),
      );
      expect(built.tree.places).toHaveLength(4 * sets + 4);
      expect(built.tree.dancers).toHaveLength(4 * sets + 4);
      expect(built.tree.places.every((place) => place.occupant !== undefined)).toBe(true);
    }
  });

  it("puts four couples round a square, each facing the middle", () => {
    const program = fixtures();
    const built = buildTree(program, findDance(program, "corners")!);
    expect(built.diagnostics).toEqual([]);
    expect(printTree(built.tree)).toMatchSnapshot();
  });

  it("lays a triple minor three couples deep, with the ends unseated", () => {
    const program = fixtures();
    const built = buildTree(
      program,
      findDance(program, "down-the-hall")!,
      hallFacts({ "minor-sets": 2 }),
    );
    expect(built.diagnostics).toEqual([]);
    const sets = built.tree.nodes.filter((node) => node.kind === "MinorSet");
    expect(sets).toHaveLength(2);
    expect(placesUnder(sets[0]!).map((place) => place.occupant?.id)).toEqual([
      "0-1L",
      "0-1R",
      "0-2L",
      "0-2R",
      "0-3L",
      "0-3R",
    ]);
    // `seated = false` is a place with nobody in it: the fixture's ends.
    const stations = built.tree.nodes.filter(
      (node) => node.kind === "Station" && node.idLabel !== "In",
    );
    expect(
      stations.flatMap((node) => placesUnder(node)).every((p) => p.occupant === undefined),
    ).toBe(true);
  });

  it("keeps an anchor as data, in the frame it was declared in", () => {
    const program = fixtures();
    const built = buildTree(program, findDance(program, "butter")!, hallFacts({ "minor-sets": 1 }));
    const set = built.tree.nodes.find((node) => node.kind === "MinorSet");
    expect(set?.anchors["across"]).toEqual({
      t: "anchor",
      form: "line",
      args: [
        { name: "through", value: { t: "point", x: 0, y: 0 } },
        { name: "along", value: { t: "enum", member: "Y", enumName: "Axis" } },
      ],
    });
  });

  it("reads a select in a body as the node's own descendants", () => {
    // §3: "`select` in a body is relative to that node and yields its
    // descendants" — so each pairing counts its own lark, not all four.
    const program = withModule(
      "relative",
      `use contra::{Role};

group Pairing {
  id: i32
  body {
    left(0.4m) Role(Lark);
    right(0.4m) Role(Robin);
    anchor mine = point(count(select(Role = Lark)), count(select(Role = _)));
  }
}

fn two() { setup { translate(y = -1m) Pairing(1); translate(y = 1m) Pairing(2); } }
`,
    );
    const built = buildTree(program, findDance(program, "two")!);
    expect(built.diagnostics).toEqual([]);
    const pairings = built.tree.nodes.filter((node) => node.kind === "Pairing");
    expect(pairings).toHaveLength(2);
    for (const pairing of pairings)
      expect(pairing.anchors["mine"]).toEqual({
        t: "anchor",
        form: "point",
        args: [
          { name: "", value: { t: "num", v: 1, unit: "" } },
          { name: "", value: { t: "num", v: 2, unit: "" } },
        ],
      });
  });

  it("refuses a move in setup: there is nobody dancing yet", () => {
    const program = fixtures({ broken: true });
    const built = buildTree(program, findDance(program, "early")!, hallFacts({ "minor-sets": 2 }));
    expect(built.diagnostics.map((d) => d.code)).toEqual(["L109"]);
    expect(built.diagnostics[0]?.message).toContain("swing");
  });

  it("refuses a relation read in a body: a body runs for nobody", () => {
    const program = withModule(
      "pair",
      `use contra::{Role, Couple};

group Pair {
  id: i32
  body {
    translate(x = -0.64m) Couple(Ones);
    anchor facing = direction(partner);
  }
}

fn lay() { setup { Pair(1); } }
`,
    );
    const built = buildTree(program, findDance(program, "lay")!);
    expect(built.diagnostics.map((d) => d.code)).toEqual(["L100"]);
    expect(built.diagnostics[0]?.message).toContain("runs for nobody");
  });
});
