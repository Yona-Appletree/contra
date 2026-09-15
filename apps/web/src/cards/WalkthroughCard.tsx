import type { Dance } from "@caller/choreo";
import type { Hint, WalkthroughEntry } from "@caller/contra";
import { danceWalkthrough, headingTokens } from "@caller/contra";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { CALL_COLOUR_VARS } from "./callColours.js";
import { CallTokens } from "./CallTokens.js";

/**
 * **The walkthrough card**: the dance as a caller would teach it (scheme B).
 *
 * The opening the formation supplies, one entry per call of the record, and the
 * sentence at the wrap. Every entry opens at its figure's own default level —
 * the common easy ones on their name alone, the unusual ones on the mechanics
 * line — and **one** "more" switches between them (D29, D30: the user, on the
 * spike, "I think the two-level more is a bit awkward… my instinct is just one
 * level of more for the time being"). "Show" opens the figure itself, danced
 * from *this* dance's own resolution (D23).
 *
 * Where the figure leaves you is under "more" too (D24), in its own quiet
 * italic with no rule bar down its left (D29), because it is the app talking
 * rather than the caller.
 */
export function WalkthroughCard({ dance }: { dance: Dance }): JSX.Element {
  const card = useMemo(() => danceWalkthrough(dance), [dance]);
  const [opened, setOpened] = useState<Readonly<Record<number, boolean>>>({});

  return (
    <div
      className="caller-music-card"
      data-testid="dance-page-walkthrough"
      style={CALL_COLOUR_VARS}
    >
      <div className="caller-music-card-head">
        <span className="caller-music-card-title">The walkthrough</span>
        <span className="caller-music-card-author">{dance.title}</span>
      </div>
      <div className="walkthrough-body">
        <p className="walkthrough-opening">{card.opening.line}</p>
        {card.opening.hint === undefined ? null : (
          <p className="walkthrough-hint" data-testid="walkthrough-opening-hint">
            {card.opening.hint}
          </p>
        )}

        {card.entries.map((entry, i) => (
          <Entry
            key={entry.index}
            dance={dance}
            entry={entry}
            phrase={card.entries[i - 1]?.phrase === entry.phrase ? undefined : entry.phrase}
            open={opened[entry.index] ?? entry.defaultLevel === "line"}
            onToggle={() =>
              setOpened((held) => ({
                ...held,
                [entry.index]: !(held[entry.index] ?? entry.defaultLevel === "line"),
              }))
            }
          />
        ))}

        <p className="walkthrough-wrap" data-testid="walkthrough-wrap">
          {card.wrap.text}
          {card.wrap.progressed ? null : (
            <span className="walkthrough-note"> Check the encoding.</span>
          )}
        </p>
      </div>
    </div>
  );
}

/** One call of the record: its beats, its name, and what is under "more". */
function Entry({
  dance,
  entry,
  phrase,
  open,
  onToggle,
}: {
  dance: Dance;
  entry: WalkthroughEntry;
  /** The phrase label, on the first entry of each phrase only. */
  phrase?: string;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <>
      {entry.passBreak === undefined ? null : (
        <p className="walkthrough-pass" data-testid="walkthrough-pass-break">
          {entry.passBreak}
        </p>
      )}
      <div
        className="walkthrough-entry"
        data-testid="walkthrough-entry"
        data-figure={entry.lines[0]?.figure ?? ""}
        data-index={entry.index}
        data-level={open ? "line" : "name"}
        {...(entry.lines.length > 1 ? { "data-while": "1" } : {})}
      >
        <span className="walkthrough-label">{phrase ?? ""}</span>
        <span className="walkthrough-beats">{entry.beats === 0 ? "—" : entry.beats}</span>
        <div className="walkthrough-said">
          {/*
           * **A caller's own paragraphs** (vision §4): before the heading and
           * after the hint, in the ordinary text style rather than the hint's,
           * because they are the caller talking and the hint is the app.
           */}
          {entry.before === undefined ? null : (
            <p className="walkthrough-said-own" data-testid="walkthrough-before">
              {entry.before}
            </p>
          )}
          <p className="walkthrough-heading">
            <CallTokens tokens={headingTokens(entry.heading)} text={entry.heading} />
          </p>
          <p className="walkthrough-actions">
            <button type="button" data-testid="walkthrough-more" onClick={onToggle}>
              {open ? "less" : "more"}
            </button>
            {entry.lines.map((line) => (
              <a
                key={line.branch}
                data-testid="walkthrough-show"
                data-figure={line.figure}
                href={`#/moves/${line.figure}?dance=${dance.slug}&figure=${String(entry.index)}${
                  line.branch === 0 ? "" : `&branch=${String(line.branch)}`
                }`}
              >
                show{entry.lines.length > 1 ? ` ${line.figure}` : ""}
              </a>
            ))}
          </p>
          {open ? (
            <>
              {entry.lines.map((line) => (
                <p key={line.branch} className="walkthrough-line">
                  {entry.lines.length > 1 && line.who !== undefined ? <b>{line.who}: </b> : null}
                  {line.line}
                </p>
              ))}
              <HintText hint={entry.hint} />
            </>
          ) : null}
          {entry.after === undefined ? null : (
            <p className="walkthrough-said-own" data-testid="walkthrough-after">
              {entry.after}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** Where this call leaves you, said once for everybody or once per role. */
function HintText({ hint }: { hint?: Hint }): JSX.Element | null {
  if (hint === undefined) return null;
  if ("text" in hint) {
    return (
      <p className="walkthrough-hint" data-testid="walkthrough-hint">
        {hint.text}
      </p>
    );
  }
  return (
    <p className="walkthrough-hint" data-testid="walkthrough-hint">
      {hint.byRole.robins === undefined ? null : (
        <>
          <b>Robins:</b> {hint.byRole.robins}{" "}
        </>
      )}
      {hint.byRole.larks === undefined ? null : (
        <>
          <b>Larks:</b> {hint.byRole.larks}
        </>
      )}
    </p>
  );
}
