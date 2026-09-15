import { describe, expect, it } from "vitest";
import { createPlayer } from "./Player.js";
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
});
