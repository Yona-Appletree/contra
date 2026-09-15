import type { Dance } from "@caller/choreo";
import { callingCard } from "@caller/contra";
import type { JSX } from "react";
import { useMemo } from "react";
import { CALL_COLOUR_VARS } from "./callColours.js";
import { CallTokens } from "./CallTokens.js";

/**
 * **The calling card**: what a caller says for this dance, at every register,
 * down the record (scheme C).
 *
 * One row per written call and one column per time-through budget — the whole
 * sentence the first time, the middle form for the next two, a word after that.
 * Only the first column is coloured (D32): the short forms are what a caller
 * drops into the middle of a phrase and they are plain ink.
 *
 * Nothing under the table explains the window or the budget. A card is a thing
 * you read while the band plays; the explanation is `docs/move-texts.md`'s.
 */
export function CallingCard({ dance }: { dance: Dance }): JSX.Element {
  const rows = useMemo(() => callingCard(dance), [dance]);
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

/** What each budget is, in a caller's own terms. */
const COLUMN_NAMES: readonly string[] = ["first time", "2nd and 3rd", "later"];

/** A cell that repeats the one to its left is dimmed: the spike's own rule. */
const cellClass = (before: string | undefined, text: string): string =>
  before !== undefined && before === text
    ? "calling-card-call calling-card-same"
    : "calling-card-call";
