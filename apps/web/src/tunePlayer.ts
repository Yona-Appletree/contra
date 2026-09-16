import type { Beat } from "@caller/core";
import type { Player, Tune } from "@caller/music";
import { createPlayer } from "@caller/music";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One tune at a time, for the Tunes tab (F4).
 *
 * The Stage's player plays an evening: a medley per dance, the tune switching
 * on the dance's own beat 0, the count-in scheduled against the programme's
 * clock. This is the small case of the same `Player`: a one-tune medley
 * that loops until it is stopped, with four potatoes in front of the first
 * time through, and the beat read back as state at whole-beat granularity —
 * which is what the notation's bar cursor and the chart's lit cell need, and
 * nothing finer.
 *
 * `play(tune)` on a tune that is already playing — the same slug, another
 * band — keeps the beat: the new band is loaded while the old one plays on,
 * and takes over from where the clock is. That is the band switcher, and it
 * is the one thing here the Stage does not do.
 */
export interface TunePlayback {
  /** The tune the player is on — with whatever band it was asked for — or `null` when silent. */
  tune: Tune | null;
  /** From the tap until the band is loaded and the potatoes have started. */
  loading: boolean;
  /** The tune's beat, whole beats: negative through the potatoes, 0 when silent. */
  beat: Beat;
  /** Why the last `play` did nothing, or `null`. */
  error: string | null;
  play(tune: Tune): Promise<void>;
  stop(): void;
  /** Stop if this tune is the one playing; play it otherwise. */
  toggle(tune: Tune): Promise<void>;
}

/** The count-in: four potatoes, as the Stage counts a dance in. */
export const TUNE_POTATO_BEATS = 4;

export function useTunePlayer(): TunePlayback {
  const playerRef = useRef<Player | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  /** The tune the player is on, for the clock loop and for `play` to read without a render. */
  const currentRef = useRef<Tune | null>(null);
  /** Which `play` call is the latest; an older one that finishes loading later stands down. */
  const requestRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const [tune, setTune] = useState<Tune | null>(null);
  const [loading, setLoading] = useState(false);
  const [beat, setBeat] = useState<Beat>(0);
  const [error, setError] = useState<string | null>(null);

  const stopFrames = useCallback((): void => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  /** Read the clock once a frame; the state moves once a beat. */
  const startFrames = useCallback((): void => {
    stopFrames();
    let shown = Number.NaN;
    const tick = (): void => {
      const player = playerRef.current;
      if (player === null || currentRef.current === null) return;
      const now = Math.floor(player.clock.beat());
      if (now !== shown) {
        shown = now;
        setBeat(now);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [stopFrames]);

  const stop = useCallback((): void => {
    requestRef.current += 1;
    stopFrames();
    playerRef.current?.stop();
    currentRef.current = null;
    setTune(null);
    setBeat(0);
    setLoading(false);
  }, [stopFrames]);

  const play = useCallback(
    async (next: Tune): Promise<void> => {
      const request = (requestRef.current += 1);
      setLoading(true);
      setError(null);
      try {
        let player = playerRef.current;
        if (player === null) {
          const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
          const ctx = AudioCtor === undefined ? undefined : new AudioCtor();
          ctxRef.current = ctx ?? null;
          // The band's samples ship with the app (public/soundfont/), as on
          // the Stage.
          player = createPlayer(ctx, { soundFontUrl: `${import.meta.env.BASE_URL}soundfont/` });
          playerRef.current = player;
        }
        await ctxRef.current?.resume();
        // The old band plays on while the new one primes, so a band switch
        // has no hole in it; `play` below stops it in the same call that
        // starts the next.
        await player.load({ slug: next.slug, tunes: [next], timesThroughEach: 1 });
        if (request !== requestRef.current) return;

        const previous = currentRef.current;
        const sameTune = previous !== null && previous.slug === next.slug;
        currentRef.current = next;
        if (sameTune) {
          const at = player.clock.beat();
          const cycle = next.beatsPerCycle;
          player.play(((at % cycle) + cycle) % cycle);
        } else {
          player.play(0, { potatoBeats: TUNE_POTATO_BEATS });
        }
        setTune(next);
        startFrames();
      } catch (caught) {
        if (request !== requestRef.current) return;
        setError(String(caught));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [startFrames],
  );

  const toggle = useCallback(
    async (next: Tune): Promise<void> => {
      if (currentRef.current?.slug === next.slug) stop();
      else await play(next);
    },
    [play, stop],
  );

  // Leaving the page silences it: the player, then the context it was on.
  useEffect(
    () => (): void => {
      stopFrames();
      playerRef.current?.stop();
      void ctxRef.current?.close();
    },
    [stopFrames],
  );

  return { tune, loading, beat, error, play, stop, toggle };
}
