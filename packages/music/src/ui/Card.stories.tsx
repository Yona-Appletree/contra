import { useEffect, useState } from "react";
import { Card } from "./Card.js";
import type { CardProps } from "./Card.js";

// See Notation.stories.tsx for why these are plain CSF3 objects, not
// `@storybook/react-vite`-typed ones.
const meta = {
  title: "Music/Card",
  component: Card,
};
export default meta;

const dance: CardProps["dance"] = {
  title: "Spike Dance · improper · 64 beats",
  phrases: [
    {
      name: "A1",
      figures: [
        { beats: 8, call: "Neighbours balance" },
        { beats: 8, call: "Neighbours swing" },
      ],
    },
    { name: "A2", figures: [{ beats: 16, call: "Long lines forward & back" }] },
    {
      name: "B1",
      figures: [
        { beats: 8, call: "Partners balance" },
        { beats: 8, call: "Partners swing" },
      ],
    },
    {
      name: "B2",
      figures: [
        { beats: 8, call: "Circle left 3/4" },
        { beats: 8, call: "California twirl" },
      ],
    },
  ],
};

export const AtStart = {
  args: { dance, beat: 0 },
};

export const MidPhraseB1 = {
  args: { dance, beat: 40 },
};

function PlayingCard() {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const bpm = 112;
    const start = performance.now();
    const id = setInterval(() => {
      const elapsedSeconds = (performance.now() - start) / 1000;
      setBeat((elapsedSeconds * bpm) / 60);
    }, 100);
    return () => clearInterval(id);
  }, []);
  return <Card dance={dance} beat={beat} />;
}

/** The card readout tracking a plain interval standing in for the audio clock. */
export const Playing = {
  render: () => <PlayingCard />,
};
