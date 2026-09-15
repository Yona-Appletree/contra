import type { CallToken } from "@caller/contra";
import type { JSX } from "react";

/**
 * **A caller's line, coloured by part** (D26).
 *
 * The user, on the old contra card program: "lets add color coding to the words
 * in the main call … Robins - who, allemande - what, right - which way, once and
 * a half - how far. something like that, not too bold."
 *
 * Four parts, four quiet hues, and **nothing else on either card is coloured**:
 * the short forms are plain ink (D32), the walkthrough's lines and hints are
 * plain ink, and none of the four is a role colour or anywhere near one — a
 * "who" span is the same colour whether it says ROBINS or LARKS, which is the
 * whole of D8 applied to a card.
 */
export function CallTokens({
  tokens,
  text,
  plain = false,
}: {
  tokens: readonly CallToken[];
  /** What to print where there are no tokens, or where the ink is plain. */
  text: string;
  /** Short calls are never coloured (D32). */
  plain?: boolean;
}): JSX.Element {
  if (plain || tokens.length === 0) return <>{text}</>;
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={`call-token call-token--${token.kind}`}>
          {i === 0 ? token.text : ` ${token.text}`}
        </span>
      ))}
    </>
  );
}
