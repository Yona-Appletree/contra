// Unit tests for the ContraDB page parser in derive-contradb.mjs.
//
// Every input here is a hand-written HTML fragment shaped like the real
// pages: nothing reads the private cache, so these tests run anywhere. The
// fragments are deliberately small and each one pins a single thing the
// parser has to get right — a continuation row, a lingo mark, an entity, the
// progression pilcrow, a page with no table at all.

import { describe, expect, it } from "vitest";
import {
  cachedIds,
  collapseWhitespace,
  decodeEntities,
  deriveAll,
  extractBlock,
  formatJson,
  loadManifest,
  parseArgs,
  parseDancePage,
  parseFigureTable,
  plainText,
  resolveDataRoot,
} from "./derive-contradb.mjs";

/** One figure row, shaped exactly like ContraDB's template writes it. */
function row(label, beats, figureHtml) {
  return (
    `         <tr class="a1b1 dance-show-long-figure">\n` +
    `             <td>${label}</td>\n` +
    `             <td class=dance-show-beats>${beats}</td>\n` +
    `             <td><div class="show-figure">${figureHtml}</div>\n</td></tr>\n</tr>`
  );
}

/** A whole dance page: the wrapper, the blocks, and the figure table. */
function page({
  title = "The Rendezvous",
  choreographer = '<a href="/choreographers/4">Dan Pearl</a>',
  formation = "improper ",
  hook = null,
  preamble = "",
  notes = "",
  rows = [],
  table = true,
} = {}) {
  const tableHtml = table
    ? `<table class="table table-bordered table-condensed contra-table-nonfluid">\n${rows.join("\n")}</table>`
    : "";
  return (
    `<!DOCTYPE html>\n<html><body class="dances-show-body">\n` +
    `<div class="dances-show-content">\n` +
    `      <h1 class="dance-show-title">${title}</h1>\n` +
    // The stray </h2> is ContraDB's own typo, present on every hooked page.
    (hook === null ? "" : `        <p class="dance-show-hook">hook: ${hook}</h2>\n`) +
    `      <p class="dance-show-choreographer">by: <strong>${choreographer}</strong></p>\n` +
    `      <p class="dance-show-formation">formation: ${formation}</p>\n` +
    `<div class="dance-show-preamble"><div class='contra-markdown-block'>${preamble}</div></div>\n` +
    tableHtml +
    `\n<div class="dance-show-notes"><div class='contra-markdown-block'>${notes}</div></div>\n` +
    `</div></body></html>\n`
  );
}

describe("decodeEntities", () => {
  it("decodes the named entities ContraDB's template emits", () => {
    expect(decodeEntities("neighbors balance &amp; swing")).toBe("neighbors balance & swing");
    expect(decodeEntities("&quot;down&quot; the hall")).toBe('"down" the hall');
    expect(decodeEntities("a &lt;b&gt; c")).toBe("a <b> c");
  });

  it("decodes the fraction entities a transcriber may type", () => {
    expect(decodeEntities("do si do 1&frac12;")).toBe("do si do 1½");
    expect(decodeEntities("&frac14; &frac34;")).toBe("¼ ¾");
  });

  it("decodes decimal and hexadecimal numeric entities", () => {
    expect(decodeEntities("ladles&#39; chain")).toBe("ladles' chain");
    expect(decodeEntities("&#8267;")).toBe("⁋");
    expect(decodeEntities("&#x2E0B;")).toBe("⸋");
  });

  it("leaves an entity it does not know exactly as it came", () => {
    expect(decodeEntities("&notanentity; &#999999999999;")).toBe("&notanentity; &#999999999999;");
  });
});

describe("plainText", () => {
  it("drops inline tags without leaving a gap and blocks with one", () => {
    expect(plainText("<u>swing</u>")).toBe("swing");
    expect(plainText("re<em>ally</em>hot")).toBe("reallyhot");
    expect(plainText("<p>one</p><p>two</p>")).toBe("one two");
  });

  it("collapses every run of whitespace, &nbsp; included", () => {
    expect(collapseWhitespace("  a \n\n b\t c ")).toBe("a b c");
    expect(plainText("a&nbsp;&nbsp;b")).toBe("a b");
  });
});

describe("extractBlock", () => {
  it("matches </div> by depth, so a notes block with divs survives whole", () => {
    const html = `<div class="dance-show-notes"><div class='md'><div>deep</div> tail</div></div>after`;
    const block = extractBlock(html, "dance-show-notes");
    expect(block).toEqual({
      found: true,
      closed: true,
      inner: `<div class='md'><div>deep</div> tail</div>`,
    });
  });

  it("reports an absent block and an unclosed one differently", () => {
    expect(extractBlock("<p>nothing</p>", "dance-show-notes").found).toBe(false);
    expect(extractBlock(`<div class="dance-show-notes"><div>`, "dance-show-notes")).toEqual({
      found: true,
      closed: false,
      inner: "",
    });
  });
});

describe("parseFigureTable", () => {
  it("reads a normal table, carrying the phrase through a continuation row", () => {
    const html = page({
      rows: [
        row("A1", 16, "neighbors balance &amp; swing"),
        row("A2", 8, "long lines forward &amp; back"),
        row("", 8, "ladles do si do 1&frac12;"),
      ],
    });
    const { figures, warnings } = parseFigureTable(html);
    expect(warnings).toEqual([]);
    expect(figures.map((f) => [f.index, f.phrase, f.startsPhrase, f.beats, f.text])).toEqual([
      [0, "A1", true, 16, "neighbors balance & swing"],
      [1, "A2", true, 8, "long lines forward & back"],
      [2, "A2", false, 8, "ladles do si do 1½"],
    ]);
  });

  it("records the underlined and struck lingo words and strips their tags", () => {
    const html = page({
      rows: [
        row("A1", 8, "neighbors swing, finish facing <u>down the hall</u>"),
        row("", 8, "circle right 3 places (<s>follow</s> your <u>left</u> hand)"),
      ],
    });
    const { figures } = parseFigureTable(html);
    expect(figures[0].lingo).toEqual({ underlined: ["down the hall"], struck: [] });
    expect(figures[0].text).toBe("neighbors swing, finish facing down the hall");
    expect(figures[1].lingo).toEqual({ underlined: ["left"], struck: ["follow"] });
    expect(figures[1].text).toBe("circle right 3 places (follow your left hand)");
  });

  it("moves the trailing pilcrow out of the text and into progression", () => {
    const html = page({
      rows: [row("B2", 2, "slide left along set ⁋"), row("", 6, "circle left 3 places")],
    });
    const { figures } = parseFigureTable(html);
    expect(figures[0]).toMatchObject({ text: "slide left along set", progression: true });
    expect(figures[1]).toMatchObject({ text: "circle left 3 places", progression: false });
  });

  it("finds the cells by what they are, not by column order", () => {
    const html =
      `<table class="table table-bordered table-condensed contra-table-nonfluid">` +
      `<tr><td><div class="show-figure">star left</div></td>` +
      `<td>B1</td><td class=dance-show-beats>8</td></tr></table>`;
    const { figures } = parseFigureTable(html);
    expect(figures[0]).toMatchObject({ phrase: "B1", beats: 8, text: "star left" });
  });

  it("warns instead of throwing when a beats cell is unreadable", () => {
    const html =
      `<table class="table table-bordered table-condensed contra-table-nonfluid">` +
      `<tr><td>A1</td><td class=dance-show-beats>lots</td>` +
      `<td><div class="show-figure">swing</div></td></tr></table>`;
    const { figures, warnings } = parseFigureTable(html);
    expect(figures[0].beats).toBe(null);
    expect(warnings).toEqual([`row 0 has an unreadable beats cell "lots"`]);
  });

  it("yields no figures and a warning when the page has no table", () => {
    const { figures, warnings } = parseFigureTable(page({ table: false }));
    expect(figures).toEqual([]);
    expect(warnings).toEqual(["no figure table (contra-table-nonfluid) on the page"]);
  });
});

describe("parseDancePage", () => {
  const manifestLine = { id: 1, fetchedAt: "2026-09-16T15:30:00.000Z", publish: "everywhere" };

  it("builds the whole record in the shape docs/corpus-derived.md states", () => {
    const html = page({
      rows: [row("A1", 16, "neighbors balance &amp; swing"), row("A2", 8, "long lines ⁋")],
    });
    expect(parseDancePage(html, { id: 1, manifestLine })).toEqual({
      source: "contradb",
      id: "1",
      url: "https://contradb.com/dances/1",
      fetchedAt: "2026-09-16T15:30:00.000Z",
      publish: "everywhere",
      title: "The Rendezvous",
      choreographer: "Dan Pearl",
      formation: "improper",
      hook: "",
      preamble: "",
      notes: "",
      figures: [
        {
          index: 0,
          phrase: "A1",
          startsPhrase: true,
          beats: 16,
          text: "neighbors balance & swing",
          progression: false,
          lingo: { underlined: [], struck: [] },
        },
        {
          index: 1,
          phrase: "A2",
          startsPhrase: true,
          beats: 8,
          text: "long lines",
          progression: true,
          lingo: { underlined: [], struck: [] },
        },
      ],
      beats: 24,
      warnings: [],
    });
  });

  it("reads the hook past ContraDB's stray </h2>, and the prose blocks as text", () => {
    const html = page({
      hook: "constant contact",
      preamble: "<p>start in long waves, <u>ladles</u> facing in</p>",
      notes: "<ul>\n<li>middles turn under</li>\n</ul>\n\n<p>2 July 2013</p>",
      rows: [row("A1", 8, "swing")],
    });
    const record = parseDancePage(html, { id: 2, manifestLine });
    expect(record.hook).toBe("constant contact");
    expect(record.preamble).toBe("start in long waves, ladles facing in");
    expect(record.notes).toBe("middles turn under 2 July 2013");
    expect(record.choreographer).toBe("Dan Pearl");
  });

  it("keeps a choreographer's name even when it is not a link", () => {
    const record = parseDancePage(page({ choreographer: "Anon", rows: [row("A1", 8, "swing")] }), {
      id: 3,
      manifestLine,
    });
    expect(record.choreographer).toBe("Anon");
  });

  it("returns figures: [] and a warning for a page with no table, never throwing", () => {
    const record = parseDancePage(page({ table: false }), { id: 4, manifestLine });
    expect(record.figures).toEqual([]);
    expect(record.beats).toBe(0);
    expect(record.title).toBe("The Rendezvous");
    expect(record.warnings).toEqual(["no figure table (contra-table-nonfluid) on the page"]);
  });

  it("warns, rather than failing, when the manifest has no line for the id", () => {
    const record = parseDancePage(page({ rows: [row("A1", 8, "swing")] }), { id: 5 });
    expect(record.fetchedAt).toBe(null);
    expect(record.publish).toBe(null);
    expect(record.warnings).toEqual(["no manifest line for this id"]);
  });
});

describe("loadManifest", () => {
  it("keeps the last line for an id, because the manifest is append-only", () => {
    const text = [
      JSON.stringify({ id: 1, fetchedAt: "first", publish: "sketchbook", status: "skipped" }),
      JSON.stringify({ id: 2, fetchedAt: "other", publish: "everywhere", status: "ok" }),
      JSON.stringify({ id: 1, fetchedAt: "last", publish: "everywhere", status: "ok" }),
      "",
    ].join("\n");
    const byId = loadManifest(text);
    expect(byId.get("1")).toMatchObject({ fetchedAt: "last", publish: "everywhere" });
    expect(byId.size).toBe(2);
  });

  it("skips a truncated last line from a killed crawl", () => {
    const byId = loadManifest(`${JSON.stringify({ id: 7, fetchedAt: "t" })}\n{"id":8,"fetch`);
    expect([...byId.keys()]).toEqual(["7"]);
  });
});

describe("deriveAll", () => {
  const pages = {
    1: page({ rows: [row("A1", 16, "neighbors balance &amp; swing ⁋")] }),
    2: page({ table: false }),
    3: page({ hook: "constant contact", rows: [row("A1", 8, "<u>swing</u>")] }),
  };
  const manifestById = new Map([
    ["1", { fetchedAt: "t1", publish: "everywhere" }],
    ["2", { fetchedAt: "t2", publish: "everywhere" }],
    ["3", { fetchedAt: "t3", publish: "everywhere" }],
  ]);

  it("counts what --report prints and never stops on a bad page", () => {
    const { records, counts, warningCounts } = deriveAll({
      ids: ["1", "2", "3"],
      readPage: (id) => pages[id],
      manifestById,
    });
    expect(counts).toMatchObject({
      pages: 3,
      figures: 2,
      progressionMarks: 1,
      withLingo: 1,
      withHook: 1,
      noTable: 1,
      withWarnings: 1,
      unreadable: 0,
    });
    expect(warningCounts.get("no figure table (contra-table-nonfluid) on the page")).toBe(1);
    expect(records.map((record) => record.id)).toEqual(["1", "2", "3"]);
  });

  it("turns a page that throws into a warned record rather than a crash", () => {
    const { records, counts } = deriveAll({
      ids: ["9"],
      readPage: () => {
        throw new Error("ENOENT");
      },
      manifestById,
    });
    expect(counts.unreadable).toBe(1);
    expect(records[0]).toMatchObject({
      id: "9",
      figures: [],
      warnings: ["unreadable page: ENOENT"],
    });
  });

  it("writes identical bytes on a second run over the same input", async () => {
    const run = async () => {
      const { records } = deriveAll({
        ids: ["1", "2", "3"],
        readPage: (id) => pages[id],
        manifestById,
      });
      return Promise.all(records.map((record) => formatJson(record)));
    };
    expect(await run()).toEqual(await run());
  });
});

describe("formatJson and cachedIds", () => {
  it("writes prettier's own JSON shape, so running prettier over it changes nothing", async () => {
    const once = await formatJson({ a: 1, b: [], c: ["swing"] });
    expect(once).toBe('{\n  "a": 1,\n  "b": [],\n  "c": ["swing"]\n}\n');
    expect(await formatJson(JSON.parse(once))).toBe(once);
  });

  it("orders ids numerically, so a run is deterministic, and ignores other files", () => {
    expect(
      cachedIds(["10.html", "2.html", "manifest.jsonl", "index-page-0.json", "1.html"]),
    ).toEqual(["1", "2", "10"]);
  });
});

describe("parseArgs and resolveDataRoot", () => {
  it("reads --data, --only and --report", () => {
    expect(parseArgs(["--data", "/tmp/d", "--only", "1, 3474", "--report"])).toEqual({
      data: "/tmp/d",
      only: ["1", "3474"],
      report: true,
    });
    expect(parseArgs([])).toEqual({ data: null, only: null, report: false });
  });

  it("refuses an argument it does not know", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });

  it("prefers --data, then CONTRA_DATA, then CONTRA_DATA_DIR, then ../contra-data", () => {
    const env = { CONTRA_DATA: "/env/data", CONTRA_DATA_DIR: "/env/dir" };
    expect(resolveDataRoot({ dataArg: "/flag", env, repoRoot: "/repo" })).toBe("/flag");
    expect(resolveDataRoot({ env, repoRoot: "/repo" })).toBe("/env/data");
    expect(resolveDataRoot({ env: { CONTRA_DATA_DIR: "/env/dir" }, repoRoot: "/repo" })).toBe(
      "/env/dir",
    );
    expect(resolveDataRoot({ env: {}, repoRoot: "/repo" })).toBe("/contra-data");
  });
});
