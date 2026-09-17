import { useEffect, useState } from "react";
import { Notation, type NotationCaption } from "./Notation.js";
import { soldiersJoy } from "../tunes/soldiersJoy.js";

// Plain CSF3 objects (no `@storybook/react-vite` type imports): this package
// does not depend on Storybook's packages (see packages/music/README.md,
// "Deviations"), so story files stay structurally typed rather than
// generic-typed. Storybook only needs the shape at runtime.
const meta = {
  title: "Music/Notation",
  component: Notation,
};
export default meta;

export const AtStart = {
  args: { tune: soldiersJoy, beat: 0 },
};

export const MidTune = {
  args: { tune: soldiersJoy, beat: 40 },
};

function PlayingNotation() {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const bpm = soldiersJoy.defaultBpm;
    const start = performance.now();
    const id = setInterval(() => {
      const elapsedSeconds = (performance.now() - start) / 1000;
      setBeat((elapsedSeconds * bpm) / 60);
    }, 100);
    return () => clearInterval(id);
  }, []);
  return <Notation tune={soldiersJoy} beat={beat} />;
}

/** The moving cursor, driven by a plain interval standing in for the audio clock. */
export const Playing = {
  render: () => <PlayingNotation />,
};

/**
 * The package ships no styles (the app's `hall.css` dresses these four
 * classes), so the stories carry the minimum that makes the drawing legible.
 */
const DEMO_STYLES = `
.caller-music-notation { max-width: 520px; }
.caller-music-notation svg { display: block; width: 100%; height: auto; }
.caller-music-current-measure { fill: #c8362f; stroke: #c8362f; }
.caller-music-stave-label { font: 600 9px system-ui, sans-serif; fill: currentColor; opacity: .55; }
.caller-music-caption { font: 7px system-ui, sans-serif; fill: currentColor; opacity: .5; letter-spacing: .02em; }
.caller-music-caption.current { opacity: 1; font-weight: 600; fill: #c8362f; }
.caller-music-caption-tick { stroke: currentColor; stroke-width: .4; opacity: .35; }
.caller-music-bar-hit:hover { fill: rgba(0, 0, 0, .06); }
`;

const PHRASES = ["A1", "A2", "B1", "B2"];

/** A dance's calls over the four phrases, the way the hall's tune box hands them in. */
const CALLS: NotationCaption[] = [
  { line: 0, fromBar: 0, bars: 4, text: "Circle left 3/4" },
  { line: 0, fromBar: 4, bars: 4, text: "Neighbour swing", current: true },
  { line: 1, fromBar: 0, bars: 4, text: "Long lines forward and back" },
  { line: 1, fromBar: 4, bars: 4, text: "Robins chain" },
  { line: 2, fromBar: 0, bars: 4, text: "Star right once around" },
  { line: 2, fromBar: 4, bars: 4, text: "Partner swing" },
  { line: 3, fromBar: 0, bars: 4, text: "Balance the ring" },
  { line: 3, fromBar: 4, bars: 2, text: "Petronella turn" },
  { line: 3, fromBar: 6, bars: 2, text: "Balance the ring again" },
];

/** The labels at the left of each stave and the calls under the bars they take. */
export const WithLabelsAndCaptions = {
  render: () => (
    <div>
      <style>{DEMO_STYLES}</style>
      <Notation
        tune={soldiersJoy}
        beat={12}
        showTitle={false}
        staveLabels={PHRASES}
        captions={CALLS}
      />
    </div>
  ),
};

function ClickableNotation() {
  const [clicked, setClicked] = useState<string>("nothing yet");
  return (
    <div>
      <style>{DEMO_STYLES}</style>
      <Notation
        tune={soldiersJoy}
        beat={12}
        showTitle={false}
        staveLabels={PHRASES}
        captions={CALLS}
        onBarClick={(line, measure) => {
          setClicked(`${PHRASES[line] ?? String(line)}, bar ${String(measure + 1)}`);
        }}
      />
      <p data-testid="clicked-bar">Clicked: {clicked}</p>
    </div>
  );
}

/** Every bar is a click target; this one logs which. */
export const Clickable = {
  render: () => <ClickableNotation />,
};
