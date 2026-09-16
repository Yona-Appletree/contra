import type { CandidateFile } from "./candidates.js";

// Every **candidate reading** this package bundles (M9h), as data: one
// caller's reading of where a dance physically carries its progression, written
// as the clauses that reading adds to the transcript's own record. See
// `candidates.ts` for what one may say and `docs/dance-record.md` for the file
// format. Nothing here is a dance of its own: the record in `data/dances/` is
// untouched and no candidate is in the programme.
import annasReelAllemandeN2 from "../../../../data/dances/lab/annas-reel~allemande-n2.json" with { type: "json" };
import annasReelHey from "../../../../data/dances/lab/annas-reel~hey.json" with { type: "json" };
import annasReelSameRoleSwing from "../../../../data/dances/lab/annas-reel~same-role-swing.json" with { type: "json" };
import contrablendCircleWithShadow from "../../../../data/dances/lab/contrablend~circle-with-shadow.json" with { type: "json" };
import contrablendRollaways from "../../../../data/dances/lab/contrablend~rollaways.json" with { type: "json" };
import contrablendShoulderRound from "../../../../data/dances/lab/contrablend~shoulder-round.json" with { type: "json" };
import fatalAttractionB1Promenade from "../../../../data/dances/lab/fatal-attraction~b1-promenade.json" with { type: "json" };
import fatalAttractionCastBackEnd from "../../../../data/dances/lab/fatal-attraction~cast-back-end.json" with { type: "json" };
import fatalAttractionPromenade from "../../../../data/dances/lab/fatal-attraction~promenade.json" with { type: "json" };
import jeremyCornersContraDb from "../../../../data/dances/lab/jeremy-corners~contradb.json" with { type: "json" };
import jeremyCornersCorners from "../../../../data/dances/lab/jeremy-corners~corners.json" with { type: "json" };
import jeremyCornersDiamond from "../../../../data/dances/lab/jeremy-corners~diamond.json" with { type: "json" };
import jeremyCornersSwingFaceDown from "../../../../data/dances/lab/jeremy-corners~swing-face-down.json" with { type: "json" };
import theSetMonsterContraDb from "../../../../data/dances/lab/the-set-monster~contradb.json" with { type: "json" };
import theSetMonsterPullbys from "../../../../data/dances/lab/the-set-monster~pullbys.json" with { type: "json" };
import theSetMonsterSquareThrough from "../../../../data/dances/lab/the-set-monster~square-through.json" with { type: "json" };

/**
 * Every candidate reading, **in the order the lab lays them out**: the dances in
 * the order E6 asks about them, and each dance's readings in the order E6 lists
 * them — except that where **ContraDB has a page for the dance, its pilcrows
 * lead**, because a pilcrow there is the same question E6 asks, answered by the
 * people who catalogue the dance.
 *
 * Two of the five have one (`⁋`), and neither answer was among E6's own:
 *
 * - **Jeremy Corners** (`contradb.com/dances/3242`): one pilcrow per pass, on
 *   B2's neighbour swing — the last call of the pass, where E6 offered the
 *   diamond, the corners and the B1 swing.
 * - **The Set Monster** (`contradb.com/dances/2068`): **three** pilcrows, one
 *   per place of its triple progression — the robins' pull-by right, number
 *   two's pull-by left and the star through with number four.
 *
 * The other three are not on ContraDB at all. Cary Ravitz's own page there
 * (`/choreographers/2`) does not list **Contrablend**; **Anna's Reel** is there
 * (`/dances/2207`) and carries **no** pilcrow, and calls itself becket where
 * this record is duple improper with a swap-sides progression; and the
 * **Fatal Attraction** ContraDB holds (`/dances/1097`) is a different dance of
 * the same name by Cary Ravitz, not Roger Auman's. Those three keep the
 * transcript readings E6 asked about.
 *
 * A module of its own for the same reason `danceFiles.ts` is one: nothing here
 * imports anything but the JSON, so it is a leaf and the loader can read it
 * without a cycle.
 */
export const CANDIDATE_FILES: readonly CandidateFile[] = [
  contrablendRollaways,
  contrablendCircleWithShadow,
  contrablendShoulderRound,
  annasReelHey,
  annasReelSameRoleSwing,
  annasReelAllemandeN2,
  jeremyCornersContraDb,
  jeremyCornersDiamond,
  jeremyCornersCorners,
  jeremyCornersSwingFaceDown,
  theSetMonsterContraDb,
  theSetMonsterPullbys,
  theSetMonsterSquareThrough,
  fatalAttractionPromenade,
  fatalAttractionCastBackEnd,
  fatalAttractionB1Promenade,
] as CandidateFile[];
