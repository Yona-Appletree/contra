// Unit tests for derive-fixtures.mjs.
//
// Everything here is hand-written: a hand set of four dances, a permission
// table, and a captured filesystem. Nothing reads the private cache and
// nothing writes into the public repository — the run's three side effects
// (write, remove, readFixture) are injected, which is also how the "prune a
// dance that has left `full`" rule is tested without a crawl.

import { describe, expect, it } from "vitest";
import {
  FIXTURES_README,
  PUBLIC_PATHS,
  existingFixtureIds,
  fixtureIds,
  formatReadme,
  parseArgs,
  planFixtures,
  resolvePublicRoot,
  runFixtures,
} from "./derive-fixtures.mjs";

const HAND_DANCES = [
  { id: "10320", cluster: "butter--gene-hubert", title: "Butter", tier: 1, reasons: [] },
  { id: "40", cluster: "x--y", title: "Gated Dance", tier: 2, reasons: [] },
  { id: "9", cluster: "z--w", title: "Small", tier: 3, reasons: [] },
];

const PERMISSIONS = new Map([
  ["10320", "full"],
  ["40", "brief"],
  ["9", "full"],
]);

/** A run against a captured filesystem. */
async function run(options = {}) {
  const written = new Map();
  const removed = [];
  const result = await runFixtures({
    handDances: HAND_DANCES,
    permissionById: PERMISSIONS,
    existing: [],
    readFixture: (id) => `{"id":"${id}"}\n`,
    write: (path, text) => written.set(path, text),
    remove: (path) => removed.push(path),
    ...options,
  });
  return { ...result, written, removed };
}

describe("fixtureIds", () => {
  it("takes the hand-set records whose permission is full, by numeric id", () => {
    const { ids } = fixtureIds({ handDances: HAND_DANCES, permissionById: PERMISSIONS });
    expect(ids).toEqual(["9", "10320"]);
  });

  it("holds back a hand-set record the site does not mark full, and says which", () => {
    const { droppedNotFull } = fixtureIds({
      handDances: HAND_DANCES,
      permissionById: PERMISSIONS,
    });
    expect(droppedNotFull).toEqual([{ id: "40", permission: "brief" }]);
  });

  it("holds back a record that has no derived file at all", () => {
    const { ids, droppedNotFull } = fixtureIds({
      handDances: [{ id: "999" }],
      permissionById: new Map(),
    });
    expect(ids).toEqual([]);
    expect(droppedNotFull[0].permission).toBe("(no derived record)");
  });
});

describe("existingFixtureIds", () => {
  it("reads the id off each fixture file and ignores everything else", () => {
    expect(existingFixtureIds(["10320.json", "9.json", "README.md", ".DS_Store"])).toEqual([
      "9",
      "10320",
    ]);
  });
});

describe("planFixtures", () => {
  it("writes everything that qualifies and removes everything that no longer does", () => {
    expect(planFixtures({ wanted: ["1", "2"], existing: ["2", "3"] })).toEqual({
      write: ["1", "2"],
      remove: ["3"],
    });
  });
});

describe("runFixtures", () => {
  it("writes one fixture per qualifying record and nothing for the rest", async () => {
    const { written, counts } = await run();
    expect([...written.keys()]).toEqual(
      expect.arrayContaining([
        `${PUBLIC_PATHS.fixtures}/9.json`,
        `${PUBLIC_PATHS.fixtures}/10320.json`,
      ]),
    );
    expect(written.has(`${PUBLIC_PATHS.fixtures}/40.json`)).toBe(false);
    expect(counts.written).toBe(2);
  });

  it("copies a derived record byte for byte", async () => {
    const { written } = await run();
    expect(written.get(`${PUBLIC_PATHS.fixtures}/10320.json`)).toBe('{"id":"10320"}\n');
  });

  it("removes a fixture whose dance has left `full`", async () => {
    // 40 is in the set but is no longer `full`; its file must go.
    const { removed, counts } = await run({ existing: ["40", "10320"] });
    expect(removed).toEqual([`${PUBLIC_PATHS.fixtures}/40.json`]);
    expect(counts.removed).toBe(1);
  });

  it("removes a fixture that has left the hand set", async () => {
    const { removed } = await run({ existing: ["9", "10320", "7777"] });
    expect(removed).toEqual([`${PUBLIC_PATHS.fixtures}/7777.json`]);
  });

  it("copies the index and both set files, and writes the README", async () => {
    const copies = [
      { to: PUBLIC_PATHS.index, text: '{"id":"1"}\n' },
      { to: PUBLIC_PATHS.hand, text: "{}\n" },
      { to: PUBLIC_PATHS.suite, text: "{}\n" },
    ];
    const { written, counts } = await run({ copies });
    expect(written.get(PUBLIC_PATHS.index)).toBe('{"id":"1"}\n');
    expect(written.get(PUBLIC_PATHS.hand)).toBe("{}\n");
    expect(written.get(PUBLIC_PATHS.suite)).toBe("{}\n");
    expect(written.get(PUBLIC_PATHS.readme)).toContain("The Caller's Box");
    expect(counts.copied).toBe(3);
  });

  it("--report writes and removes nothing, but still says what it would do", async () => {
    const { written, removed, plan, counts } = await run({
      existing: ["40"],
      report: true,
      write: () => {
        throw new Error("--report must not write");
      },
      remove: () => {
        throw new Error("--report must not remove");
      },
    });
    expect(written.size).toBe(0);
    expect(removed).toEqual([]);
    expect(plan.write).toEqual(["9", "10320"]);
    expect(plan.remove).toEqual(["40"]);
    expect(counts.written).toBe(0);
  });

  it("--only narrows the copy and prunes nothing, since a slice cannot judge the rest", async () => {
    const { written, removed, plan } = await run({ existing: ["7777"], only: ["10320"] });
    expect(plan.write).toEqual(["10320"]);
    expect(plan.remove).toEqual([]);
    expect(removed).toEqual([]);
    expect(written.has(`${PUBLIC_PATHS.fixtures}/9.json`)).toBe(false);
  });

  it("is deterministic: a second run writes the same bytes", async () => {
    const first = await run();
    const second = await run();
    expect([...second.written.entries()]).toEqual([...first.written.entries()]);
  });
});

describe("the README", () => {
  it("states the source, the rule, the pruning and the contact", async () => {
    const text = await formatReadme();
    expect(text).toContain("The Caller's Box");
    expect(text).toContain("https://www.ibiblio.org/contradance/thecallersbox/");
    expect(text).toContain("`Permission: full` only");
    expect(text).toContain("Never rendered, searched or indexed");
    expect(text).toContain("Pruned on any change of permission");
    expect(text).toContain("Removed on request");
    expect(text).toContain("https://github.com/Yona-Appletree/contra/issues");
    // The four things a reader is told are inside each record.
    for (const field of ["`id`", "`url`", "`permission`", "`fetchedAt`"]) {
      expect(text).toContain(field);
    }
  });

  it("is already prettier-formatted, so a copy passes format:check unchanged", async () => {
    expect(await formatReadme()).toBe(FIXTURES_README);
  });
});

describe("parseArgs", () => {
  it("defaults to this repository, writing", () => {
    expect(parseArgs([])).toEqual({ data: null, public: null, only: null, report: false });
  });

  it("parses --data, --public, --only and --report", () => {
    expect(parseArgs(["--public", "/tmp/try", "--only", "10320", "--report"])).toEqual({
      data: null,
      public: "/tmp/try",
      only: ["10320"],
      report: true,
    });
  });

  it("rejects an unknown argument and a --public without a path", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--public"])).toThrow(/--public requires a path/);
  });
});

describe("resolvePublicRoot", () => {
  it("is this repository unless --public says otherwise", () => {
    expect(resolvePublicRoot({}, "/repo")).toBe("/repo");
    expect(resolvePublicRoot({ publicArg: "/tmp/try" }, "/repo")).toBe("/tmp/try");
  });
});
