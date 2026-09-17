import { ALL_DANCES, DATA_DEFINITIONS, heyDefinition, paramDefaults } from "@caller/contra";
import { describe, expect, test } from "vitest";
import { definitionIds, variantTile } from "./galleryTiles.js";
import type { MoveEntry, MoveVariant } from "./moveCatalogue.js";
import {
  MAX_VARIANTS,
  moveCatalogue,
  moveEntries,
  movesUses,
  variantKey,
} from "./moveCatalogue.js";
import { alternativeValues, paramValueText, roleColourOf } from "./moveParams.js";

const catalogue = moveCatalogue();
const entries = moveEntries();
const variants = entries.flatMap((entry) => entry.variants);

describe("the catalogue", () => {
  test("holds every definition the library holds, and nothing by hand", () => {
    // The whole point of M12: the page's list is the library's list. If a
    // milestone adds a definition it appears here with no edit to the app.
    expect(entries.map((entry) => entry.id)).toEqual(definitionIds());
    expect(entries.filter((entry) => entry.def !== undefined).map((entry) => entry.id)).toEqual(
      DATA_DEFINITIONS.map((def) => def.id),
    );
  });

  test("files every move in exactly one family, and no family is empty", () => {
    const filed = catalogue.flatMap((family) => family.moves);
    expect(filed.length).toBe(entries.length);
    expect(new Set(filed.map((entry) => entry.id)).size).toBe(entries.length);
    expect(catalogue.every((family) => family.moves.length > 0)).toBe(true);
  });

  test("files a move under its definition's own shape kind", () => {
    for (const family of catalogue) {
      for (const entry of family.moves) {
        expect(entry.def?.shape.kind ?? "engine", entry.id).toBe(family.id);
      }
    }
  });

  test("says which figures the registry has and the library does not", () => {
    // `wait-out` and `walk-to-station`: the decider needs both whether a dance
    // calls them or not, and no planner can resolve a call of one. Read off the
    // two registries rather than written down, so the list empties itself.
    const engine = entries.filter((entry) => entry.def === undefined).map((entry) => entry.id);
    expect(engine).toEqual(["wait-out", "walk-to-station"]);
    for (const entry of entries) {
      if (entry.def !== undefined) continue;
      expect(entry.variants, entry.id).toEqual([]);
      expect(entry.params, entry.id).toEqual([]);
    }
  });

  test("reads every row's facts off the definition rather than restating them", () => {
    for (const entry of entries) {
      if (entry.def === undefined) continue;
      expect(entry.nominalBeats, entry.id).toBe(entry.def.nominalBeats);
      expect(entry.roles, entry.id).toEqual(entry.def.roles);
      expect(entry.actors, entry.id).toBe(entry.def.actors);
      expect(entry.timing, entry.id).toEqual(entry.def.timing);
      expect(
        entry.params.map((p) => p.name),
        entry.id,
      ).toEqual(Object.keys(paramDefaults(entry.def)));
    }
  });

  test("marks the parameters a dance really writes", () => {
    const swing = entryOf("swing");
    // Every dance that swings names who it is with; nothing in the record has
    // ever touched the hand offset.
    expect(swing.params.find((p) => p.name === "pairs")?.written).toBe(true);
    expect(swing.params.find((p) => p.name === "handOffset")?.written).toBe(false);
  });
});

describe("the dance ↔ figure index", () => {
  test("holds every call of every figure in every dance file, branches included", () => {
    // Counted the other way round — over the dances rather than over the
    // figures — so the two only agree if nothing was dropped. `while` branches
    // are ordinary calls (M8) and Fatal Attraction's larks only ever go forward
    // inside one.
    const calls = ALL_DANCES.flatMap((dance) =>
      dance.phrases.flatMap((phrase) =>
        phrase.figures.flatMap((call) => [call, ...(branchesOf(call) ?? [])]),
      ),
    );
    const indexed = entries.flatMap((entry) => entry.dances);
    expect(indexed.length).toBe(
      calls.filter((call) => definitionIds().includes(call.figure)).length,
    );
    expect(movesUses("fatal-attraction/go-forward").map((use) => use.slug)).toEqual([
      "fatal-attraction",
    ]);
  });

  test("says whether a dance is in the programme or only in the lab", () => {
    const uses = movesUses("swing");
    expect(uses.some((use) => use.programme)).toBe(true);
    expect(uses.some((use) => !use.programme)).toBe(true);
    // The programme first, so a reader is not sent to a half-encoded dance.
    const firstLab = uses.findIndex((use) => !use.programme);
    expect(uses.slice(firstLab).every((use) => !use.programme)).toBe(true);
  });
});

describe("the parameter rows", () => {
  test("are a tuning that really differs from the definition's own", () => {
    for (const variant of variants) {
      const def = entryOf(variant.id).def!;
      const defaults = paramDefaults(def);
      expect(Object.keys(variant.params).length, variant.key).toBeGreaterThan(0);
      for (const [name, value] of Object.entries(variant.params)) {
        expect(JSON.stringify(value), `${variant.key}/${name}`).not.toBe(
          JSON.stringify(defaults[name]),
        );
      }
    }
  });

  test("have keys that are unique, and safe as a file name and in markdown", () => {
    expect(new Set(variants.map((v) => v.key)).size).toBe(variants.length);
    for (const variant of variants) {
      // One `~` separates the figure from its tuning and there is never a
      // second: `prettier` reads `~a~` in a generated index's link as
      // strikethrough and would rewrite the file it is asked to check.
      expect(variant.key.split("~").length, variant.key).toBe(2);
      expect(variant.key.startsWith(`${variant.id}~`), variant.key).toBe(true);
      expect(variant.key, variant.key).toMatch(/^[A-Za-z0-9/=.+~-]+$/);
    }
  });

  test("keep a long value short without letting two rows collide", () => {
    const long = { passes: "LR N2L RR PL LR N2L RR PL" };
    const other = { passes: "LR N2L RR PL LR N2L RR PR" };
    expect(variantKey("hey", long)).not.toBe(variantKey("hey", other));
    expect(variantKey("hey", long).length).toBeLessThan(60);
  });

  test("come from the record, the texts and the spec, within the cap on each", () => {
    for (const entry of entries) {
      for (const source of ["record", "texts", "spec"] as const) {
        const n = entry.variants.filter((v) => v.from === source).length;
        expect(n, `${entry.id}/${source}`).toBeLessThanOrEqual(MAX_VARIANTS[source]);
      }
    }
    // All three sources are actually used somewhere, or one of them is dead.
    for (const source of ["record", "texts", "spec"] as const) {
      expect(
        variants.some((v) => v.from === source),
        source,
      ).toBe(true);
    }
  });

  test("include the five the brief names, none of them written down here", () => {
    const keys = new Set(variants.map((v) => v.key));
    // Half a hey and the ricochet hey are Jubilation's and On the Prowl's own
    // calls; the hey for three is the parameter spec's `for` one fewer than the
    // figure's cast; circle right is `direction`'s opposite in Contrablend;
    // star left 7/8 is Are You 'Most Done?'s `hand` and `amount` together.
    expect(keys).toContain("hey~amount=0.5");
    expect(keys).toContain("hey~for=3");
    expect(keys).toContain("circle~direction=right");
    expect(keys).toContain("star~hand=L+amount=0.875");
    const hey = entryOf("hey").variants.find((v) => v.params["passes"] !== undefined);
    expect(String(hey?.params["passes"])).toContain("L!");
  });

  test("either draw, or say why not — and never throw", () => {
    // The brief's own rule. A hey for three expands perfectly well and a tile
    // of one two-couple set has nobody to stand out; the row is prose, not a
    // stack trace, and the page stays up.
    const problems: string[] = [];
    for (const variant of variants) {
      const made = variantTile(variant.id, {
        key: variant.key,
        title: variant.key,
        params: variant.params,
        ...(variant.beats === undefined ? {} : { beats: variant.beats }),
        ...(variant.dance === undefined ? {} : { dance: variant.dance }),
        ...(variant.who === undefined ? {} : { who: variant.who }),
      });
      if ("problem" in made) {
        expect(made.problem.length, variant.key).toBeGreaterThan(0);
        problems.push(variant.key);
      } else {
        expect(made.tile.kind, variant.key).toBe("variant");
        expect(made.tile.key, variant.key).toBe(variant.key);
      }
    }
    // Most of them draw. If this ever inverts, something has broken in
    // resolution rather than in the catalogue.
    expect(problems.length).toBeLessThan(variants.length / 4);
    expect(problems).toContain("hey~for=3");
  });

  test("carry the caller's own short line where the texts can say it", () => {
    const half = variantOf("hey~amount=0.5");
    expect(half.callShort).toBe("HALF HEY");
    // **M12's second finding, closed** (M13): `{amount}` now has a word for a
    // third, which Jeremy Corners promenades single file, so the row that used
    // to have no line at all has one.
    const third = variants.find((v) => v.key.startsWith("single-file-promenade~amount=0.33"));
    expect(third?.callShort).toBe("SINGLE FILE");
  });
});

describe("the caller's vocabulary a parameter spec is read through", () => {
  test("gives a handed or directional word its one opposite, both ways", () => {
    const def = heyDefinition;
    expect(alternativeValues("by", "right", def)).toEqual(["left"]);
    expect(alternativeValues("by", "left", def)).toEqual(["right"]);
    expect(alternativeValues("hand", "R", def)).toEqual(["L"]);
    expect(alternativeValues("start", "robin", def)).toEqual(["lark"]);
  });

  test("says nothing about a tuning number", () => {
    // `weavePx`, `holdDrop`, `stackPx`: a row showing a swing with its hands
    // 1 px lower is not a variant of anything.
    expect(alternativeValues("weavePx", 6.5, heyDefinition)).toEqual([]);
    expect(alternativeValues("passDrop", 6, heyDefinition)).toEqual([]);
  });

  test("counts a hey for three off the figure's own cast, not off the number four", () => {
    expect(heyDefinition.roles.length).toBe(4);
    expect(alternativeValues("for", 4, heyDefinition)).toEqual([3]);
    // A `for` that is not the cast size is a call's own choice, not a variant.
    expect(alternativeValues("for", 3, heyDefinition)).toEqual([]);
  });

  test("writes a list-valued parameter as JSON rather than as a comma", () => {
    // `String([["1L","2L"]])` is `1L,2L`, which reads as one dancer with a
    // comma in their name.
    expect(paramValueText([["1L", "2L"]])).toBe('[["1L","2L"]]');
    expect(paramValueText(0.875)).toBe("0.875");
  });

  test("knows which figure-role words name a contra role (D5)", () => {
    expect(roleColourOf("lark")).toBe("lark");
    expect(roleColourOf("2R")).toBe("robin");
    // An allemande's parts are `a` and `b` and the figure has no opinion about
    // which is which, so they get no colour.
    expect(roleColourOf("a")).toBeUndefined();
  });
});

/** The catalogue entry of that id. */
function entryOf(id: string): MoveEntry {
  const found = entries.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no entry "${id}"`);
  return found;
}

/** The parameter row of that key. */
function variantOf(key: string): MoveVariant {
  const found = variants.find((variant) => variant.key === key);
  if (found === undefined) throw new Error(`no parameter row "${key}"`);
  return found;
}

/** A call's concurrent branches, as the record writes them. */
function branchesOf(call: { while?: unknown }): { figure: string }[] | undefined {
  const branches = call.while;
  if (branches === undefined) return undefined;
  return (Array.isArray(branches) ? branches : [branches]) as { figure: string }[];
}
