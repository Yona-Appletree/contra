import type { Dance } from "@caller/choreo";
import { FULL_CALL_BUDGET, callingCard } from "@caller/contra";
import type { JSX } from "react";
import { useMemo } from "react";
import { NOTE_CARD_BUDGET } from "../danceCard.js";
import { CALL_COLOUR_VARS } from "./callColours.js";
import { CallTokens } from "./CallTokens.js";

/**
 * **The card's two columns, by register** (P7, DD67): the whole sentence
 * ({@link FULL_CALL_BUDGET}) and the short form the note card also uses
 * ({@link NOTE_CARD_BUDGET}) — the same two numbers, so the card and the
 * Stage's own note card can never drift apart on what "the short form" means.
 */
const CARD_POLICY = { budgets: [FULL_CALL_BUDGET, NOTE_CARD_BUDGET] };

/**
 * **The calling card**: what a caller says for this dance, at every register,
 * down the record (scheme C).
 *
 * One row per written call and one column per register (P7, DD67, the user's
 * verbatim gate edit on #72): the 4-beat call, then the 2-beat call — not one
 * column per time through, which is a different axis (how many times the hall
 * has already danced this) that this card no longer shows. Only the first
 * column is coloured (D32): the short form is what a caller drops into the
 * middle of a phrase and it is plain ink.
 *
 * Nothing under the table explains the window or the budget. A card is a thing
 * you read while the band plays; the explanation is `docs/move-texts.md`'s.
 */
export function CallingCard({ dance }: { dance: Dance }): JSX.Element {
  const rows = useMemo(() => callingCard(dance, CARD_POLICY), [dance]);
  const budgets = rows[0]?.byTime.map((cell) => cell.budget) ?? [];

  return (
    <div
      className="caller-music-card"
      data-testid="dance-page-calling-card"
      style={CALL_COLOUR_VARS}
    >
      <div className="caller-music-card-head">
        <span className="caller-music-card-title">The calling card</span>
        <span className="caller-music-card-author">{dance.title}</span>
      </div>
      <div className="calling-card-scroll">
        <table className="calling-card">
          <thead>
            <tr>
              <th scope="col" className="calling-card-phrase">
                <span className="sr-only">Phrase</span>
              </th>
              <th scope="col" className="calling-card-beats">
                <span className="sr-only">Beats</span>
              </th>
              {budgets.map((budget, i) => (
                <th key={budget} scope="col">
                  {COLUMN_NAMES[i] ?? `${String(budget)} beats`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.index}
                data-testid="calling-card-row"
                data-figure={row.figure}
                data-index={row.index}
                {...(row.branches === undefined ? {} : { "data-while": "1" })}
              >
                <th scope="row" className="calling-card-phrase">
                  {rows[i - 1]?.phrase === row.phrase ? "" : row.phrase}
                </th>
                <td className="calling-card-beats">{row.beats}</td>
                {row.byTime.map((cell, column) => (
                  <td
                    key={cell.budget}
                    className={cellClass(row.byTime[column - 1]?.text, cell.text)}
                  >
                    {cell.mergedInto === undefined ? (
                      <CallTokens tokens={cell.tokens} text={cell.text} plain={column > 0} />
                    ) : (
                      <span className="calling-card-merged">&mdash;</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** What each budget is, in a caller's own terms: the register, not the time through. */
const COLUMN_NAMES: readonly string[] = ["4-beat call", "2-beat call"];

/** A cell that repeats the one to its left is dimmed: the spike's own rule. */
const cellClass = (before: string | undefined, text: string): string =>
  before !== undefined && before === text
    ? "calling-card-call calling-card-same"
    : "calling-card-call";
