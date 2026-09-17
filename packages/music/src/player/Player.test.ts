import { describe, expect, it } from "vitest";
import { MUTE_RAMP_SECONDS, createPlayer } from "./Player.js";
import { reelMedley } from "../tunes/medleys.js";
import type { Tune } from "../tunes/Tune.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createPlayer (silence mode: no AudioContext)", () => {
  it("load() resolves without an AudioContext", async () => {
    const player = createPlayer();
    await expect(player.load(reelMedley)).resolves.toBeUndefined();
  });

  it("takes a soundfont URL, which is inert without audio", async () => {
    const player = createPlayer(undefined, { soundFontUrl: "/contra/soundfont/" });
    await player.load(reelMedley);
    const seen: number[] = [];
    player.onCycle((cycle) => seen.push(cycle));
    player.play(0);
    expect(seen).toEqual([0]);
    player.stop();
  });

  it("play() emits a cycle event immediately for the starting cycle", async () => {
    const player = createPlayer();
    await player.load(reelMedley);
    const seen: Array<[number, Tune]> = [];
    player.onCycle((cycle, tune) => seen.push([cycle, tune]));
    player.play(0);
    // The initial cycle event fires synchronously within play().
    expect(seen).toEqual([[0, reelMedley.tunes[0]]]);
    player.stop();
  });

  it("play() at a beat mid-medley picks the right tune for that cycle", async () => {
    const player = createPlayer();
    await player.load(reelMedley);
    // reelMedley: [soldiersJoy, soldiersJoy, stAnnesReel, stAnnesReel] (timesThroughEach: 2)
    const seen: Array<[number, Tune]> = [];
    player.onCycle((cycle, tune) => seen.push([cycle, tune]));
    player.play(2 * 64); // cycle 2 -> stAnnesReel
    expect(seen).toEqual([[2, reelMedley.tunes[1]]]);
    player.stop();
  });

  it("the clock advances linearly while playing (silence mode uses performance.now)", async () => {
    const player = createPlayer();
    await player.load(reelMedley);
    player.setTempo(120);
    player.play(0);
    const b0 = player.clock.beat();
    await wait(120);
    const b1 = player.clock.beat();
    expect(b1).toBeGreaterThan(b0);
    // Roughly bpm/60 beats per second, allow generous slack for test timing jitter.
    const expectedDelta = (120 / 60) * 0.12;
    expect(b1 - b0).toBeGreaterThan(expectedDelta * 0.3);
    expect(b1 - b0).toBeLessThan(expectedDelta * 3);
    player.stop();
  });

  it("emits cycle events as cycles pass, and stop() halts them", async () => {
    const player = createPlayer();
    await player.load(reelMedley);
    player.setTempo(12800); // ~300ms per 64-beat cycle, fast enough to observe transitions
    const seen: number[] = [];
    player.onCycle((cycle) => seen.push(cycle));
    player.play(0);
    await wait(700);
    expect(seen).toContain(0);
    expect(seen.length).toBeGreaterThan(1);
    player.stop();
    const countAtStop = seen.length;
    await wait(200);
    expect(seen.length).toBe(countAtStop);
  });

  it("setMuted records the flag and reports no gain (there is no node to read)", async () => {
    const player = createPlayer();
    await player.load(reelMedley);
    expect(player.muted()).toBe(false);
    expect(player.gain()).toBeNull();
    expect(() => player.setMuted(true)).not.toThrow();
    expect(player.muted()).toBe(true);
    expect(player.gain()).toBeNull();
  });

  it("a muted player keeps playing: the clock and the cycle events carry on", async () => {
    // AC4: mute is a gain, not a stop. Nothing about the beat may notice it.
    const player = createPlayer();
    await player.load(reelMedley);
    player.setTempo(120);
    const seen: number[] = [];
    player.onCycle((cycle) => seen.push(cycle));
    player.play(0);
    player.setMuted(true);
    const b0 = player.clock.beat();
    await wait(120);
    expect(player.clock.beat()).toBeGreaterThan(b0);
    expect(seen).toContain(0);
    player.stop();
  });
});

/**
 * A minimal fake `AudioContext`: enough of one for `createPlayer` to build its
 * master gain and for a mute to be observed on it, and nothing more. There is
 * no `AudioContext` in Node at all, so the alternative to a fake is not
 * testing the gain — and the gain is what AC4 is written about.
 */
function fakeContext() {
  const ramps: Array<{ target: number; when: number; timeConstant: number }> = [];
  const connectedTo: unknown[] = [];
  const gain = {
    value: 1,
    setTargetAtTime(target: number, when: number, timeConstant: number): void {
      ramps.push({ target, when, timeConstant });
      // The real node approaches its target exponentially; the fake arrives,
      // which is all `gain()` needs to be readable from.
      gain.value = target;
    },
  };
  const destination = { id: "destination" };
  const gainNode = {
    gain,
    connect: (node: unknown): void => void connectedTo.push(node),
    disconnect: (): void => undefined,
  };
  const ctx = {
    currentTime: 12.5,
    destination,
    sampleRate: 48000,
    createGain: () => gainNode,
  };
  return { ctx: ctx as unknown as AudioContext, ramps, connectedTo, destination, gain };
}

describe("createPlayer (the master gain)", () => {
  it("builds a master gain and connects it to the destination", () => {
    const fake = fakeContext();
    const player = createPlayer(fake.ctx);
    expect(fake.connectedTo).toEqual([fake.destination]);
    expect(player.gain()).toBe(1);
    expect(player.muted()).toBe(false);
  });

  it("setMuted(true) ramps the gain to 0, and back to 1 on unmute", () => {
    const fake = fakeContext();
    const player = createPlayer(fake.ctx);

    player.setMuted(true);
    expect(player.muted()).toBe(true);
    expect(player.gain()).toBe(0);
    expect(fake.ramps).toEqual([{ target: 0, when: 12.5, timeConstant: MUTE_RAMP_SECONDS }]);

    player.setMuted(false);
    expect(player.muted()).toBe(false);
    expect(player.gain()).toBe(1);
    expect(fake.ramps[1]).toEqual({ target: 1, when: 12.5, timeConstant: MUTE_RAMP_SECONDS });
  });

  it("ramps rather than stepping: the gain is never assigned outright", () => {
    // A step to 0 clicks. The only way this player's gain moves is a
    // `setTargetAtTime`, which is what the recorded ramps prove.
    const fake = fakeContext();
    const player = createPlayer(fake.ctx);
    player.setMuted(true);
    player.setMuted(true);
    expect(fake.ramps.map((ramp) => ramp.target)).toEqual([0, 0]);
    expect(fake.ramps.every((ramp) => ramp.timeConstant === MUTE_RAMP_SECONDS)).toBe(true);
  });
});
