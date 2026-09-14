import { describe, expect, it } from "vitest";
import { motionReportKeysOfInterest, patchMotionReport } from "./motionReportPatch.js";

const FIXTURE = `# The motion report

## Over the ten demo dances

### The ten worst figures

| what | hand px/beat |
| --- | ---: |
| \`wait-out\` | 216.7 |
| \`do-si-do\` | 20.1 |

### The ten worst seams

| what | hand px/beat |
| --- | ---: |
| \`robins-chain → wait-out\` | 2.6 |
| \`allemande → balance\` | 218.3 |

## Every figure, alone

| what | hand px/beat |
| --- | ---: |
| \`do-si-do\` | 19.0 |
| \`hey\` | 40.0 |

## Known wrong

| figure or seam | assertion | measured | why |
| --- | --- | --- | --- |
| \`hey\` | some assertion | old measurement | old reason |
| \`do-si-do\` | other assertion | other measurement | other reason |

## What each figure actually does

### \`do-si-do\`

| | assertion | evidence |
| --- | --- | --- |
| pass | old evidence line | old note |

### \`hey\`

| | assertion | evidence |
| --- | --- | --- |
| pass | hey's own line | hey's own note |

## What every figure says it does

### \`do-si-do\` — DO SI DO

old description text.

### \`hey\` — HEY FOR FOUR

old hey description.
`;

/** The same document with only `do-si-do`'s numbers and prose changed. */
const FRESH_DO_SI_DO = FIXTURE.replace("| `do-si-do` | 19.0 |", "| `do-si-do` | 99.9 |")
  .replace("| pass | old evidence line | old note |", "| **FAIL** | new evidence line | new note |")
  .replace("old description text.", "new description text.");

describe("patchMotionReport", () => {
  it("replaces only the target key's rows and subsections", () => {
    const patched = patchMotionReport(FIXTURE, FRESH_DO_SI_DO, "do-si-do");

    // The alone table's do-si-do row moved; hey's did not.
    expect(patched).toContain("| `do-si-do` | 99.9 |");
    expect(patched).toContain("| `hey` | 40.0 |");

    // The checks subsection for do-si-do was replaced whole; hey's untouched.
    expect(patched).toContain("| **FAIL** | new evidence line | new note |");
    expect(patched).not.toContain("old evidence line");
    expect(patched).toContain("hey's own line");

    // The describe subsection for do-si-do was replaced; hey's untouched.
    expect(patched).toContain("new description text.");
    expect(patched).toContain("old hey description.");

    // Sections and rows that do not name do-si-do survive untouched.
    expect(patched).toContain("| `wait-out` | 216.7 |");
    expect(patched).toContain("| `robins-chain → wait-out` | 2.6 |");
    expect(patched).toContain("| `hey` | some assertion | old measurement | old reason |");
  });

  it("also patches a seam row on either side of the id", () => {
    const freshSeam = FIXTURE.replace(
      "| `allemande → balance` | 218.3 |",
      "| `allemande → balance` | 1.0 |",
    );
    const patched = patchMotionReport(FIXTURE, freshSeam, "balance");
    expect(patched).toContain("| `allemande → balance` | 1.0 |");
    // The other top-ten seam row, not naming `balance`, is untouched.
    expect(patched).toContain("| `robins-chain → wait-out` | 2.6 |");
  });

  it("is a no-op when fresh equals existing", () => {
    expect(patchMotionReport(FIXTURE, FIXTURE, "hey")).toBe(FIXTURE);
  });

  it("leaves the file alone when the id names nothing in either document", () => {
    expect(patchMotionReport(FIXTURE, FIXTURE, "not-a-figure")).toBe(FIXTURE);
  });
});

describe("motionReportKeysOfInterest", () => {
  it("finds the id and every seam key with it on either side", () => {
    const keys = motionReportKeysOfInterest(FIXTURE, "balance");
    expect(keys.has("balance")).toBe(true);
    expect(keys.has("allemande → balance")).toBe(true);
    expect(keys.has("robins-chain → wait-out")).toBe(false);
  });
});
