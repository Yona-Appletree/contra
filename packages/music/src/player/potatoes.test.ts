import { beforeAll, describe, expect, it } from "vitest";
import {
  POTATO_DEFAULTS,
  keyOf,
  loudestVoice,
  playPotatoes,
  potatoesFor,
  renderPotatoes,
  voiceOf,
  type PotatoVoice,
} from "./potatoes.js";
import { BAND } from "../tunes/Tune.js";
import { soldiersJoy } from "../tunes/soldiersJoy.js";
import { morrisonsJig } from "../tunes/morrisonsJig.js";
import { oldJoeClark } from "../tunes/oldJoeClark.js";
import { keshJig } from "../tunes/keshJig.js";
import { tunes } from "../tunes/index.js";

/**
 * The potatoes, measured rather than heard.
 *
 * The user: "four chords or strong notes played by the loudest instrument that
 * denote the beginning of the dance. its basically '5 6 7 8' before the '1 2 3
 * 4 …' of the dance." Nothing here can tell you they sound like a band counting
 * a hall in — no test can, and this worktree has no speakers — but it can say
 * that there are exactly four of them, that they are a beat apart, that the
 * fourth is one beat before the buffer ends (which is where the tune's bar 1
 * begins), that they never clip, and that the chord is in the tune's own key.
 */

const RATE = 48000;
const BPM = 112;

/** The loudest sample in `[from, to)` seconds. */
const peakOver = (buffer: Float32Array, from: number, to: number): number => {
  let loudest = 0;
  for (let i = Math.round(from * RATE); i < Math.min(buffer.length, Math.round(to * RATE)); i++) {
    loudest = Math.max(loudest, Math.abs(buffer[i]!));
  }
  return loudest;
};

/**
 * Where the buffer's energy jumps: the start of each chord.
 *
 * A root-mean-square envelope over a 20 ms window, stepped a millisecond at a
 * time, and an onset is a millisecond where the envelope is both loud in
 * absolute terms and well above where it was 20 ms earlier — which is how a
 * struck chord differs from the tail of the one before. A shorter window is not
 * enough: this chord's partials are all harmonics of half its root, so the
 * waveform only repeats every 13.6 ms and a 10 ms window's peak wobbles from
 * one window to the next whether or not anything was struck.
 */
const ENVELOPE_WINDOW_SECONDS = 0.02;
const HOP_SECONDS = 0.001;
const RISE = 2;
/** Two onsets closer together than this are the same strike. */
const ONSET_GAP_SECONDS = 0.2;

function onsetsIn(buffer: Float32Array): number[] {
  const window = Math.round(ENVELOPE_WINDOW_SECONDS * RATE);
  const hop = Math.round(HOP_SECONDS * RATE);
  const env: number[] = [];
  for (let i = 0; i + window <= buffer.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + window; j++) sum += buffer[j]! * buffer[j]!;
    env.push(Math.sqrt(sum / window));
  }
  const loudest = Math.max(...env);
  const back = Math.round(ENVELOPE_WINDOW_SECONDS / HOP_SECONDS);
  const gap = Math.round(ONSET_GAP_SECONDS / HOP_SECONDS);
  const out: number[] = [];
  let last = -gap;
  for (let k = 0; k < env.length; k++) {
    if (env[k]! < 0.25 * loudest) continue;
    if (k >= back && env[k]! < RISE * env[k - back]!) continue;
    if (k - last < gap) continue;
    last = k;
    out.push(k * HOP_SECONDS);
  }
  return out;
}

describe("the potatoes are four chords, a beat apart, ending a beat before bar 1", () => {
  let potatoes: Float32Array;
  beforeAll(() => {
    potatoes = renderPotatoes(RATE, { bpm: BPM });
  });

  it("lasts exactly four beats, which is where the tune's own bar 1 starts", () => {
    const beatSeconds = 60 / BPM;
    expect(potatoes.length).toBe(Math.round(RATE * 4 * beatSeconds));
    // 2.142857… seconds at 112 bpm.
    expect(potatoes.length / RATE).toBeCloseTo(4 * beatSeconds, 4);
  });

  it("has exactly four onsets, one on each beat", () => {
    const beatSeconds = 60 / BPM;
    const onsets = onsetsIn(potatoes);
    expect(onsets).toHaveLength(4);
    // A 20 ms root-mean-square window sees a strike up to a window early, so
    // each onset is read within one window of where it really is — never
    // further, and never in the wrong order.
    const SLACK = ENVELOPE_WINDOW_SECONDS;
    onsets.forEach((at, k) => {
      expect(
        Math.abs(at - k * beatSeconds),
        `potato ${String(k + 1)} at ${String(at)}`,
      ).toBeLessThan(SLACK);
    });
    // Evenly spaced, to within the measuring window.
    for (let k = 1; k < onsets.length; k++) {
      expect(Math.abs(onsets[k]! - onsets[k - 1]! - beatSeconds)).toBeLessThan(SLACK);
    }
    // The fourth is one beat before the end, which is one beat before bar 1.
    expect(Math.abs(potatoes.length / RATE - onsets[3]! - beatSeconds)).toBeLessThan(SLACK);
  });

  it("never clips: the loudest sample is exactly the peak asked for", () => {
    expect(peakOver(potatoes, 0, potatoes.length / RATE)).toBeCloseTo(POTATO_DEFAULTS.peak, 6);
  });

  it("strikes and decays rather than droning: each chord is loudest at its onset", () => {
    const beatSeconds = 60 / BPM;
    for (let k = 0; k < 4; k++) {
      const strike = peakOver(potatoes, k * beatSeconds, k * beatSeconds + 0.02);
      const before = peakOver(potatoes, (k + 1) * beatSeconds - 0.05, (k + 1) * beatSeconds);
      expect(strike, `potato ${String(k + 1)}`).toBeGreaterThan(before * 1.5);
    }
  });

  it("renders the same buffer twice, and a different one in another key", () => {
    expect(Array.from(renderPotatoes(RATE, { bpm: BPM }))).toEqual(Array.from(potatoes));
    const g = renderPotatoes(RATE, { bpm: BPM, rootHz: 196 });
    expect(Array.from(g)).not.toEqual(Array.from(potatoes));
  });

  it("works at any sample rate a browser might hand it, and for any count", () => {
    for (const rate of [22050, 44100, 48000]) {
      expect(renderPotatoes(rate, { bpm: BPM }).length).toBe(Math.round(rate * 4 * (60 / BPM)));
    }
    expect(renderPotatoes(RATE, { bpm: BPM, beats: 2 }).length).toBe(
      Math.round(RATE * 2 * (60 / BPM)),
    );
    expect(renderPotatoes(RATE, { bpm: BPM, beats: 0 }).length).toBe(1);
  });
});

describe("the chord is in the tune's own key", () => {
  it("reads the key off the tune rather than a table of slugs", () => {
    expect(keyOf(soldiersJoy).name).toBe("D");
    expect(keyOf(soldiersJoy).mode).toBe("major");
    // D below middle C.
    expect(keyOf(soldiersJoy).rootHz).toBeCloseTo(146.832, 2);
    expect(keyOf(morrisonsJig).name).toBe("Em");
    expect(keyOf(morrisonsJig).mode).toBe("minor");
    // E below middle C.
    expect(keyOf(morrisonsJig).rootHz).toBeCloseTo(164.814, 2);
  });

  it("has a key for every tune this package ships, and none of them is silent", () => {
    for (const tune of tunes) {
      const key = keyOf(tune);
      expect(key.rootHz, tune.slug).toBeGreaterThan(100);
      expect(key.rootHz, tune.slug).toBeLessThan(300);
      expect(potatoesFor(tune, tune.defaultBpm).rootHz, tune.slug).toBe(key.rootHz);
      expect(potatoesFor(tune, tune.defaultBpm).bpm, tune.slug).toBe(tune.defaultBpm);
    }
  });

  it("puts a different root under a tune in a different key", () => {
    expect(potatoesFor(soldiersJoy, BPM).rootHz).not.toBe(potatoesFor(morrisonsJig, BPM).rootHz);
  });
});

describe("the loudest instrument plays them", () => {
  it("picks the loudest voice of the arrangement, the melody winning a tie", () => {
    expect(loudestVoice(BAND)).toBe(BAND.melody);
    const pianoBand = { ...BAND, chords: { program: 0, volume: 120 } };
    expect(loudestVoice(pianoBand)).toBe(pianoBand.chords);
    const tie = { ...BAND, bass: { program: 32, volume: BAND.melody.volume } };
    expect(loudestVoice(tie)).toBe(tie.melody);
  });

  it("plays a potato in the instrument's family: strings bow it, pianos strike it, the rest pluck it", () => {
    expect(voiceOf(40)).toBe("bowed"); // violin
    expect(voiceOf(41)).toBe("bowed"); // viola
    expect(voiceOf(0)).toBe("struck"); // acoustic grand piano
    expect(voiceOf(32)).toBe("plucked"); // acoustic bass
    expect(voiceOf(25)).toBe("plucked"); // steel guitar
    expect(POTATO_DEFAULTS.voice).toBe("struck");
  });

  /**
   * The payoff of the per-tune arrangement: three of the bundled bands, three
   * different count-ins, with nothing per-tune written here or in
   * `potatoesFor` — each tune's own `arrangement` is the whole input.
   */
  it("reads the voice off the tune's own arrangement, so a band change changes the count-in", () => {
    expect(potatoesFor(soldiersJoy, BPM).voice).toBe("bowed"); // BAND: a fiddle
    expect(potatoesFor(oldJoeClark, BPM).voice).toBe("plucked"); // BANJO_BAND
    expect(potatoesFor(keshJig, BPM).voice).toBe("struck"); // PIANO_BAND
    // Every bundled tune gets one of the three; none falls through to a
    // family its melody instrument does not belong to.
    for (const tune of tunes) {
      expect(potatoesFor(tune, BPM).voice, tune.slug).toBe(
        voiceOf(tune.arrangement.melody.program),
      );
    }
    const pianoLed = {
      ...soldiersJoy,
      arrangement: { ...BAND, chords: { program: 0, volume: 127 } },
    };
    expect(potatoesFor(pianoLed, BPM).voice).toBe("struck");
    const bassLed = {
      ...soldiersJoy,
      arrangement: { ...BAND, bass: { program: 32, volume: 127 } },
    };
    expect(potatoesFor(bassLed, BPM).voice).toBe("plucked");
  });

  /** Seconds from the buffer's start to its loudest sample within the first beat. */
  const timeToPeak = (voice: PotatoVoice): number => {
    const buffer = renderPotatoes(RATE, { bpm: BPM, voice });
    const beat = Math.round((60 / BPM) * RATE);
    let at = 0;
    let loudest = 0;
    for (let i = 0; i < beat; i++) {
      if (Math.abs(buffer[i]!) > loudest) {
        loudest = Math.abs(buffer[i]!);
        at = i;
      }
    }
    return at / RATE;
  };

  it("a bowed chord swells in where a struck one is there at once", () => {
    expect(timeToPeak("struck")).toBeLessThan(0.01);
    expect(timeToPeak("plucked")).toBeLessThan(0.01);
    expect(timeToPeak("bowed")).toBeGreaterThan(0.02);
  });

  it.each(["bowed", "struck", "plucked"] as const)(
    "%s potatoes are still four, a beat apart, exactly four beats long, at the peak asked for",
    (voice) => {
      const buffer = renderPotatoes(RATE, { bpm: BPM, voice });
      expect(buffer.length).toBe(Math.round(4 * (60 / BPM) * RATE));
      const onsets = onsetsIn(buffer);
      expect(onsets).toHaveLength(4);
      for (const [k, onset] of onsets.entries()) {
        expect(onset).toBeCloseTo((k * 60) / BPM, 1);
      }
      expect(peakOver(buffer, 0, 4 * (60 / BPM))).toBeCloseTo(POTATO_DEFAULTS.peak, 3);
    },
  );
});

/**
 * A minimal fake `AudioContext` for {@link playPotatoes}: it does not make a
 * sound, it only records what the source was connected to and when it started.
 */
function fakeContext() {
  const connectedTo: unknown[] = [];
  const started: number[] = [];
  const source = {
    buffer: null as unknown,
    connect: (node: unknown): void => void connectedTo.push(node),
    start: (when: number): void => void started.push(when),
  };
  const destination = { id: "destination" };
  const ctx = {
    currentTime: 3,
    sampleRate: 8000,
    destination,
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => source,
  };
  return { ctx: ctx as unknown as AudioContext, connectedTo, started, destination };
}

describe("playPotatoes", () => {
  it("connects to the context's destination by default", () => {
    const fake = fakeContext();
    playPotatoes(fake.ctx, 5, { bpm: BPM });
    expect(fake.connectedTo).toEqual([fake.destination]);
    expect(fake.started).toEqual([5]);
  });

  it("connects to `destination` when one is given: the player's master gain", () => {
    // This is what makes the count-in obey the hall's mute (D4): the potatoes
    // go through the same gain the tune does, rather than straight out.
    const fake = fakeContext();
    const master = { id: "master gain" };
    playPotatoes(fake.ctx, undefined, { bpm: BPM, destination: master as unknown as AudioNode });
    expect(fake.connectedTo).toEqual([master]);
    // No `when`: the potatoes start now.
    expect(fake.started).toEqual([3]);
  });
});
