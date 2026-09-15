import { DANCE_FILES, danceBySlug, danceFromFile } from "@caller/contra";
import { ROLE_COLOURS } from "@caller/hall";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CALL_COLOURS } from "./callColours.js";
import { CallingCard } from "./CallingCard.js";
import { WalkthroughCard } from "./WalkthroughCard.js";

/**
 * The two cards on the dance page, rendered statically.
 *
 * What they say is `@caller/contra`'s and is tested there; what is tested here
 * is what a reader sees — the columns, the levels, the one "more", where the
 * colour is and, just as much, where it is not.
 */

/** The words a reader sees, with the markup and the entities taken out. */
const words = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

const render = (node: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(node);

describe("the calling card", () => {
  const butter = danceBySlug("butter")!;
  const html = render(<CallingCard dance={butter} />);

  it("has a row per written call and a column per register", () => {
    expect((html.match(/data-testid="calling-card-row"/g) ?? []).length).toBe(
      butter.phrases.flatMap((phrase) => phrase.figures).length,
    );
    expect(words(html)).toContain("first time");
    expect(words(html)).toContain("2nd and 3rd");
    expect(words(html)).toContain("later");
  });

  it("says Butter's first two figures in one breath, with a dash on the covered row", () => {
    expect(words(html)).toContain("SHIFT LEFT, CIRCLE LEFT THREE PLACES");
    const rows = html.split('data-testid="calling-card-row"');
    expect(rows[2]).toContain("calling-card-merged");
  });

  it("colours the first column by part, and nothing else", () => {
    // The 4-beat form of Butter's neighbour swing, split what/who.
    expect(html).toContain('class="call-token call-token--what">SWING<');
    expect(html).toContain('class="call-token call-token--who"> YOUR NEIGHBOR<');
    // The later columns are plain ink (D32): no call token span carries them.
    const cells = [...html.matchAll(/<td class="calling-card-call[^"]*">([^<]*)</g)];
    expect(cells.map((m) => m[1])).toContain("NEIGHBOR SWING");
  });

  it("marks a concurrent call's row and lists its branches", () => {
    const fatal = danceBySlug("fatal-attraction")!;
    const concurrent = render(<CallingCard dance={fatal} />);
    expect(concurrent).toContain('data-while="1"');
    expect(words(concurrent)).toContain(" WHILE ");
  });
});

describe("the walkthrough card", () => {
  const butter = danceBySlug("butter")!;
  const html = render(<WalkthroughCard dance={butter} />);

  it("opens on the formation's own sentence", () => {
    expect(words(html)).toContain(
      "Take hands four from the top, then circle one place to the left",
    );
  });

  it("has an entry per written call, each at its figure's own default level", () => {
    const entries = [...html.matchAll(/data-index="(\d+)" data-level="(name|line)"/g)];
    expect(entries.map((m) => m[1])).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    // `slide-left` opens on its mechanics line; `swing` on its name alone.
    expect(entries[0]![2]).toBe("line");
    expect(entries[2]![2]).toBe("name");
  });

  it("gives every entry one more and a show link into this dance's own resolution", () => {
    expect((html.match(/data-testid="walkthrough-more"/g) ?? []).length).toBe(7);
    expect(html).toContain('href="#/moves/slide-left?dance=butter&amp;figure=0"');
    expect(html).toContain('href="#/moves/hey?dance=butter&amp;figure=5"');
  });

  it("shows the hint under an open entry, in its own style and with no rule bar", () => {
    // The class is what carries "no rule bar" (D29); asserting the class rather
    // than the pixels is what a render test can honestly say.
    expect(html).toContain('class="walkthrough-hint" data-testid="walkthrough-hint"');
    // Butter's hey opens on its line, so its hint is the one on the page.
    expect(words(html)).toContain("Your partner is beside you. Your neighbor is across from you.");
    // A closed entry shows none: the swing opens on its name alone.
    expect(html).not.toContain("Your neighbor is beside you. Your partner is across from you.");
  });

  it("ends on the progression sentence", () => {
    expect(words(html)).toContain(
      "That's once through. Your new neighbors are on your left diagonal.",
    );
  });

  it("splits a hint by role where the roles disagree", () => {
    // Chorus Jig's lead-up opens on its line, and the cast off that follows it
    // puts each role with the other dancer of their own role.
    const said = render(<WalkthroughCard dance={danceBySlug("chorus-jig")!} />);
    expect(words(said)).toContain("Robins: The other robin is beside you.");
    expect(words(said)).toContain("Larks: The other lark is beside you.");
  });

  it("renders a caller's own paragraphs round the entry they belong to", () => {
    // The `teach` overlay (vision §4). `before` sits above the heading and
    // `after` below the hint, in the ordinary text style rather than the
    // hint's, because the caller is talking and the hint is the app.
    const edited = danceFromFile({
      ...DANCE_FILES["butter"]!,
      teach: { "A1/slide-left": { before: "Look left first.", after: "All together now." } },
    });
    const said = render(<WalkthroughCard dance={edited} />);
    expect(words(said)).toContain("Look left first.");
    expect(words(said)).toContain("All together now.");
    expect(said).toContain('class="walkthrough-said-own" data-testid="walkthrough-before"');
    expect(said).toContain('class="walkthrough-said-own" data-testid="walkthrough-after"');
  });

  it("reads a concurrent call as one entry with a line and a show link per branch", () => {
    const fatal = danceBySlug("fatal-attraction")!;
    const said = render(<WalkthroughCard dance={fatal} />);
    expect(said).toContain('data-while="1"');
    expect(said).toContain('data-figure="cast-back"');
    expect(said).toContain("&amp;branch=1");
    expect(words(said)).toContain(" while ");
  });
});

/**
 * **The four call colours are not the role colours, and not near them** (D8).
 *
 * Nothing on either card is coloured by role — the `who` colour is one colour
 * whether the word is ROBINS or LARKS — and none of the four may read as a role
 * colour either. Fifteen degrees of hue is the margin.
 */
describe("the four parts' colours", () => {
  it("keeps every one of them at least fifteen degrees from either role's hue", () => {
    const roles = [hueOf(ROLE_COLOURS.lark), hueOf(ROLE_COLOURS.robin)];
    for (const [part, hex] of Object.entries(CALL_COLOURS)) {
      // `what` is the ordinary ink and has no hue of its own to collide.
      if (hex === "inherit") continue;
      const hue = hueOf(hex);
      for (const role of roles) {
        const apart = Math.abs(((hue - role + 180) % 360) - 180);
        expect(
          apart,
          `${part} is ${String(Math.round(hue))} degrees, the role is ${String(Math.round(role))}`,
        ).toBeGreaterThan(15);
      }
    }
    expect(CALL_COLOURS.what).toBe("inherit");
  });

  it("reaches the cards as custom properties the stylesheet reads", () => {
    const html = render(<CallingCard dance={danceBySlug("butter")!} />);
    expect(html).toContain(`--call-who:${CALL_COLOURS.who}`);
    expect(html).toContain(`--call-far:${CALL_COLOURS.far}`);
  });
});

/** One hex colour's hue, in degrees. */
function hueOf(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
