import { useEffect, useState } from "react";
import { Notation } from "./Notation.js";
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
