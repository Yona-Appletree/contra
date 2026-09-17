import type { FigureDefinition } from "../FigureDefinition.js";
import { TWIRL_DEFAULTS, californiaTwirlDefinition } from "./california-twirl.js";

/**
 * **Jersey twirl**: the California twirl, danced from the mirror start.
 *
 * The user, who had asked for this one to be looked up:
 *
 * > "ok, I am 90% confident that its a California twirl with reversed hands.
 * > So normally, the larks right and robin's left are joined (this makes sense
 * > -- if the lark is on the left, robin on the right, its what's called the
 * > convenient hand -- lark right & robin right). a jersey twirl for the
 * > opposite case, when the robin is on the left and the lark on the right --
 * > the convenient hands are reversed. robin right lark left. its quite rare
 * > but comes up occasionally. I think I've danced one single dance this year
 * > with it and it was very confusing."
 *
 * So it is **not** a mirror of the *motion*, which is what the M9 figure this
 * replaces was — `direction: -1` and inside hands, a California twirl run
 * backwards, which is exactly what the user saw on the Moves page: *"maybe a
 * backwards california twirl? but these people are just orbiting about their
 * hands"*. It is the California twirl's own motion from the mirror **start**:
 *
 * | | who stands on the left | the convenient hands |
 * | --- | --- | --- |
 * | California twirl | the lark | his right in her left |
 * | Jersey twirl | the robin | her right in his left |
 *
 * Read the two rows together and the rule underneath them is one sentence: the
 * hands that reach are **the left-hand dancer's right in the right-hand
 * dancer's left**. Which pair of hands that is depends on nothing but who is
 * standing where, and that is the whole of what tells the two figures apart —
 * which is why this file is `california-twirl.ts`'s definition with two
 * defaults changed and no geometry of its own:
 *
 * - **`hand: "left-in-right"`.** The word names the raiser's hand first, so
 *   this is the lark's **left** in the robin's **right** — "robin right lark
 *   left", in the user's words.
 * - **`direction: -1`.** Mirror the start and the arc mirrors with it: the
 *   raiser still walks *forward* round the outside and the dancer under the
 *   arch still turns inside him, which from the other side of the couple is the
 *   other way round the floor. The two places the pair ends on are the same
 *   either way — it is half a turn about the point between them — so what
 *   `direction` changes is the shape of the four beats and not the outcome.
 *
 * Everything else — the close to `closePx`, the duck, the arch held over the
 * head of the dancer walking under it, the ends — is the California twirl's,
 * by the same object, so the two cannot drift apart.
 *
 * **(unsure): who raises and who goes under.** The user's description names the
 * hands and says nothing about the roles, so the California twirl's are kept —
 * `raises: "lark"`, the robin under — because "with reversed hands" most
 * plainly means the hands and only the hands. If a Jersey twirl also swaps
 * those, it is `raises: "robin"` and this definition already says it.
 *
 * ## The start it is called from, and what the library measures
 *
 * The figure's precondition is the left-hand column of that table: the robin
 * standing on the lark's left, the two of them side by side. **Measured, it is
 * met nowhere in this library's own places** — see `jersey-twirl.test.ts`,
 * which pins the measurement:
 *
 * - **Duple improper.** Partners stand across the set facing the same way, and
 *   from either lark the robin is on his **right** (`1L`→`1R` and `2L`→`2R`
 *   both). That is the California start.
 * - **Becket.** Partners stand side by side facing across, and again the robin
 *   is on the lark's **right**, in both couples.
 * - **The Set Monster**, the one dance in the record that calls this figure
 *   (B1: *"(4) In long lines, go forward (facing out) / (4) N4 neighbor Jersey
 *   twirl"*), does not dance it at all. `pairs: "N4"` reaches this figure as
 *   the **word** — a `pairs` parameter is only resolved into station pairs for
 *   a definition whose `actors` is `"pairs"`, and a twirl's is `"all"` — so
 *   `pairsOf` finds no pair inside the hands-four, nobody has a mate, and every
 *   dancer in every instance moves **0.00 px** through the four beats at every
 *   checked line length. The dance's oracle numbers therefore cannot move when
 *   this figure's geometry does, and they did not.
 *
 * A start that never occurs is not a reason to write the figure differently: it
 * is what makes the figure rare, which is what the user says about it. What it
 * does mean is that the tile draws the twirl from where a hands-four actually
 * stands, so the two named hands there are the couple's **outside** hands and
 * the picture is the honest one of a Jersey twirl called at a moment that does
 * not call for it. Refusing to draw at all was considered and not done: the
 * library's own rule since M8b is that a dancer standing somewhere a figure did
 * not expect is a *measurement* (`kinds/holds.ts`, `noInsideHands`), the reach
 * oracle is what reports it, and a figure whose precondition holds nowhere in
 * the library would refuse on its own review tile — which is the one piece of
 * evidence the user judges it by.
 */
export const jerseyTwirlDefinition: FigureDefinition = {
  ...californiaTwirlDefinition,
  id: "jersey-twirl",
  call: "JERSEY TWIRL",
  describe:
    "A California twirl from the other way round. The robin is on the lark's left and the lark on her right, so the hands that reach are reversed: her right in his left, and the lark puts it up. Come together, the robin walks under the arch while the lark walks round the outside of her, and the two of you come out on each other's places facing back the way you came. Four beats, the hand held the whole way through. It is a rare call, and the pair has to be standing that way round for it.",
  params: {
    kind: "canonical",
    defaults: {
      ...TWIRL_DEFAULTS,
      /** Her right in his left: the convenient hands from the mirror start. */
      hand: "left-in-right",
      /** The mirror start turns the mirror way round the floor. */
      direction: -1,
    },
  },
};
