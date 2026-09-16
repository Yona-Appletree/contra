import type { Beat } from "@caller/core";
import type { Player, Tune } from "@caller/music";
import { createPlayer } from "@caller/music";
import { useCallback, useEffect, useRef, useState } from "react";
import { jukeboxPosition } from "./tuneText.js";

/**
 * The jukebox (F4): a queue of tunes, one sounding at a time, the next one
 * following on — the user: "something where you can pick the tune but stay
 * on the same page to listen, like a jukebox".
 *
 * It is the Stage's `Player` playing one long medley: the queue rotated so
 * the picked tune is first, `timesThrough` times through each, chained
 * cycle to cycle by the player itself — so the band goes straight from one
 * tune into the next as it does in a set, and a queue of one tune loops.
 * Four potatoes count the first tune in; the rest follow without them, as
 * the second tune of a medley does.
 *
 * The beat is read back as state once a beat, positioned within the tune
 * that is sounding (`jukeboxPosition`), which is what the notation's bar
 * cursor, the chart's lit cell and the "2nd time" word need.
 *
 * `start(tune)` on the tune that is already sounding — the same slug with
 * another band — keeps the beat: the new medley is loaded while the old one
 * plays on, and takes over from where the clock is. That is the band
 * switcher, and it is the one thing here a set on the Stage never does.
 */
export interface Jukebox {
  /** The tune sounding now — its own object, so a switched band shows on it — or `null`. */
  playing: Tune | null;
  /** From the tap until the band is loaded and the potatoes have started. */
  loading: boolean;
  /** The beat within the sounding tune, whole beats: negative through the potatoes, 0 when silent. */
  beat: Beat;
  /** Which time through the sounding tune this is, from 1. */
  timeThrough: number;
  /** The tune the jukebox goes on to after this one, or `null` for a queue of one. */
  next: Tune | null;
  /** Why the last `start` did nothing, or `null`. */
  error: string | null;
  /** Play the queue from this tune, with the potatoes in front. */
  start(tune: Tune): Promise<void>;
  stop(): void;
  /** Stop if this tune is the one sounding; start it otherwise. */
  toggle(tune: Tune): Promise<void>;
}

/** The count-in: four potatoes, as the Stage counts a dance in. */
export const JUKEBOX_POTATO_BEATS = 4;
/** Times through each tune before the next, as a set on the Stage plays them. */
export const JUKEBOX_TIMES_THROUGH = 2;

interface Position {
  index: number;
  beat: Beat;
  timeThrough: number;
}

export function useJukebox(
  queue: readonly Tune[],
  timesThrough: number = JUKEBOX_TIMES_THROUGH,
): Jukebox {
  const playerRef = useRef<Player | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  /** The queue as loaded: rotated so the picked tune is first, its band as asked for. */
  const orderRef = useRef<Tune[]>([]);
  /** Which `start` call is the latest; an older one that finishes loading later stands down. */
  const requestRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
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
      if (player === null || orderRef.current.length === 0) return;
      const now = Math.floor(player.clock.beat());
      if (now !== shown) {
        shown = now;
        setPosition(jukeboxPosition(now, orderRef.current.length, timesThrough));
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [stopFrames, timesThrough]);

  const stop = useCallback((): void => {
    requestRef.current += 1;
    stopFrames();
    playerRef.current?.stop();
    orderRef.current = [];
    setPosition(null);
    setLoading(false);
  }, [stopFrames]);

  const start = useCallback(
    async (tune: Tune): Promise<void> => {
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

        // The queue from this tune round: the picked tune first, as handed in
        // (its band may differ from the queue's copy), then the rest in order.
        const at = Math.max(
          0,
          queue.findIndex((t) => t.slug === tune.slug),
        );
        const order = [tune, ...queue.slice(at + 1), ...queue.slice(0, at)].filter(
          (t, i) => i === 0 || t.slug !== tune.slug,
        );
        // Whether the tune asked for is the one sounding: then the beat is
        // kept, and the old band plays on while the new one primes.
        const previous = orderRef.current;
        const sounding =
          previous.length > 0 && player.clock.beat() >= 0
            ? previous[
                jukeboxPosition(Math.floor(player.clock.beat()), previous.length, timesThrough)
                  .index
              ]
            : undefined;
        const keepBeat = sounding !== undefined && sounding.slug === tune.slug;

        await player.load({ slug: "jukebox", tunes: order, timesThroughEach: timesThrough });
        if (request !== requestRef.current) return;

        orderRef.current = order;
        if (keepBeat) {
          // Where the clock is within the sounding tune, which is now item 0.
          const per = timesThrough * tune.beatsPerCycle;
          const b = player.clock.beat();
          player.play(((b % per) + per) % per);
        } else {
          player.play(0, { potatoBeats: JUKEBOX_POTATO_BEATS });
        }
        setPosition({
          index: 0,
          beat: keepBeat ? Math.floor(player.clock.beat()) : -JUKEBOX_POTATO_BEATS,
          timeThrough: 1,
        });
        startFrames();
      } catch (caught) {
        if (request !== requestRef.current) return;
        setError(String(caught));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [queue, startFrames, timesThrough],
  );

  const order = orderRef.current;
  const playing = position === null ? null : (order[position.index] ?? null);

  const toggle = useCallback(
    async (tune: Tune): Promise<void> => {
      const current = orderRef.current;
      const pos =
        current.length === 0 || playerRef.current === null
          ? null
          : jukeboxPosition(
              Math.floor(playerRef.current.clock.beat()),
              current.length,
              timesThrough,
            );
      const sounding = pos === null ? undefined : current[pos.index];
      if (sounding !== undefined && sounding.slug === tune.slug) stop();
      else await start(tune);
    },
    [start, stop, timesThrough],
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

  const next =
    position === null || order.length < 2
      ? null
      : (order[(position.index + 1) % order.length] ?? null);

  return {
    playing,
    loading,
    beat: position?.beat ?? 0,
    timeThrough: position?.timeThrough ?? 1,
    next,
    error,
    start,
    stop,
    toggle,
  };
}
