import type { Medley, NamedBand, Tune } from "@caller/music";
import {
  NAMED_BANDS,
  Notation,
  bandOf,
  chordPair,
  describeBand,
  medleys,
  rearrange,
  tunes,
} from "@caller/music";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpeakerButton } from "../SpeakerButton.js";
import type { Jukebox } from "../jukebox.js";
import { useJukebox } from "../jukebox.js";
import { PHRASE_NAMES, barAt, keyName, positionText } from "../tuneText.js";

/**
 * The Tunes tab (F4): a jukebox. The book of tunes down one side, reels then
 * jigs; the tune picked from it on the other, with the notation following
 * the music, the band switcher, the chart, a paragraph about it and where to
 * read more — the user: "something where you can pick the tune but stay on
 * the same page to listen, like a jukebox".
 *
 * Picking a tune plays it, twice through, and the jukebox goes on to the next
 * in the book as a set on the Stage goes on to its next tune — the panel
 * follows. `?tune=<slug>` and `?band=<id>` keep the pick on the URL, written
 * with `replaceState` (as the Stage writes its dance) so a change does not
 * remount the page and stop the music; a reload shows the pick, silent, until
 * a tap — the browser wants the gesture.
 */
export function TunesPage({ params }: { params: URLSearchParams }): JSX.Element {
  const book = useMemo(() => [...byType("reel"), ...byType("jig")], []);
  const [pick, setPick] = useState<Tune>(
    () => book.find((tune) => tune.slug === params.get("tune")) ?? book[0]!,
  );
  const own = bandOf(pick) ?? NAMED_BANDS[0]!;
  const [band, setBand] = useState<NamedBand>(
    () => NAMED_BANDS.find((b) => b.id === params.get("band")) ?? own,
  );
  const jukebox = useJukebox(book);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // The jukebox moved on to the next tune: the panel follows it, in its own band.
  const soundingSlug = jukebox.playing?.slug;
  useEffect(() => {
    if (soundingSlug === undefined || soundingSlug === pick.slug) return;
    const next = book.find((tune) => tune.slug === soundingSlug);
    if (next === undefined) return;
    setPick(next);
    setBand(bandOf(next) ?? NAMED_BANDS[0]!);
    setQuery({ tune: next.slug, band: undefined });
  }, [soundingSlug, pick.slug, book]);

  const choose = useCallback(
    (tune: Tune): void => {
      const tuneBand = bandOf(tune) ?? NAMED_BANDS[0]!;
      setPick(tune);
      setBand(tuneBand);
      setQuery({ tune: tune.slug, band: undefined });
      void jukebox.start(tune);
      // On a phone the panel is under the book: bring it up.
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [jukebox],
  );

  const pickBand = useCallback(
    (next: NamedBand): void => {
      setBand(next);
      setQuery({ band: next.id === own.id ? undefined : next.id });
      if (jukebox.playing?.slug === pick.slug)
        void jukebox.start(rearrange(pick, next.arrangement));
    },
    [jukebox, own.id, pick],
  );

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4"
      data-testid="tunes-page"
      data-tune={pick.slug}
      data-playing={jukebox.playing?.slug === pick.slug}
    >
      <p className="text-sm text-muted-foreground">
        The band&rsquo;s book. Pick a tune to hear it, twice through with four potatoes in front;
        the band goes on into the next one, as it would in a set.
      </p>

      <div className="jukebox">
        <nav className="jukebox-book" aria-label="The tunes">
          {(["reel", "jig"] as const).map((type) => (
            <section key={type} className="jukebox-shelf" data-testid="tunes-group">
              <h2 className="jukebox-shelf-title">{type === "reel" ? "Reels" : "Jigs"}</h2>
              <ul className="jukebox-list">
                {byType(type).map((tune) => (
                  <BookRow
                    key={tune.slug}
                    tune={tune}
                    picked={tune.slug === pick.slug}
                    sounding={tune.slug === soundingSlug}
                    onPick={() => choose(tune)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className="jukebox-panel" ref={panelRef}>
          <TunePanel
            tune={pick}
            band={band}
            own={own}
            onBand={pickBand}
            jukebox={jukebox}
            pageLink
          />
        </div>
      </div>
    </main>
  );
}

/** One line of the book: the tune, its key and tempo, and whether it is the one sounding. */
function BookRow({
  tune,
  picked,
  sounding,
  onPick,
}: {
  tune: Tune;
  picked: boolean;
  sounding: boolean;
  onPick: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        className="jukebox-row"
        data-testid="tune-row"
        data-slug={tune.slug}
        data-sounding={sounding}
        aria-current={picked ? "true" : undefined}
        onClick={onPick}
        title={`Play ${tune.title}`}
      >
        <span className="jukebox-row-title">{tune.title}</span>
        <span className="jukebox-row-meta">
          {keyName(tune.key)} &middot; {String(tune.defaultBpm)}
        </span>
        <span className="jukebox-row-mark" aria-hidden>
          {sounding ? "♪" : ""}
        </span>
      </button>
    </li>
  );
}

/**
 * `#/tunes/<slug>`: one tune's own page — the same panel as the jukebox's,
 * with a queue of one, so the tune loops until it is stopped. Linkable, and
 * the place a tune's facts live when the book is not wanted beside them.
 */
export function TunePage({ slug, params }: { slug: string; params: URLSearchParams }): JSX.Element {
  const tune = tunes.find((t) => t.slug === slug);
  if (tune === undefined) {
    return (
      <main className="p-6">
        <p data-testid="tune-page-missing">
          No tune called <code>{slug}</code>. <a href="#/tunes">Back to the jukebox</a>.
        </p>
      </main>
    );
  }
  return <TuneSheet tune={tune} params={params} />;
}

function TuneSheet({ tune, params }: { tune: Tune; params: URLSearchParams }): JSX.Element {
  const own = bandOf(tune) ?? NAMED_BANDS[0]!;
  const [band, setBand] = useState<NamedBand>(
    () => NAMED_BANDS.find((b) => b.id === params.get("band")) ?? own,
  );
  const queue = useMemo(() => [tune], [tune]);
  const jukebox = useJukebox(queue);

  const pickBand = useCallback(
    (next: NamedBand): void => {
      setBand(next);
      setQuery({ band: next.id === own.id ? undefined : next.id });
      if (jukebox.playing !== null) void jukebox.start(rearrange(tune, next.arrangement));
    },
    [jukebox, own.id, tune],
  );

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4"
      data-testid="tune-page"
      data-slug={tune.slug}
      data-band={band.id}
      data-playing={jukebox.playing !== null}
      data-beat={jukebox.playing === null ? undefined : String(jukebox.beat)}
    >
      <a href="#/tunes" className="text-sm" data-testid="tune-page-back">
        &larr; The jukebox
      </a>
      <div className="tune-page">
        <TunePanel tune={tune} band={band} own={own} onBand={pickBand} jukebox={jukebox} />
      </div>
    </main>
  );
}

/**
 * What the jukebox shows for the picked tune, and what a tune's page is: the
 * head, the play button with where the music is, the notation with the bar
 * cursor, the band switcher, the chord chart with the current bar lit, the
 * paragraph about the tune with links to read more, and the sets it is in.
 *
 * **The band switcher** is the listening check the per-tune-arrangement plan
 * owed: the same setting played by each of the four bands, switched without
 * losing the beat (`useJukebox` keeps it for the tune that is sounding).
 *
 * **The references are about the tune, not the source of this setting.** The
 * settings were typed from memory (each tune file's own provenance comment
 * says how confidently), so the panel says so once and links to where the
 * tune itself can be read about — never to a transcription it did not copy.
 */
function TunePanel({
  tune,
  band,
  own,
  onBand,
  jukebox,
  pageLink = false,
}: {
  tune: Tune;
  band: NamedBand;
  own: NamedBand;
  onBand: (band: NamedBand) => void;
  jukebox: Jukebox;
  /** Whether to offer the tune's own page — the jukebox does, the page itself does not. */
  pageLink?: boolean;
}): JSX.Element {
  const played = useMemo(() => rearrange(tune, band.arrangement), [tune, band]);
  const playing = jukebox.playing?.slug === tune.slug;
  const beat = playing ? jukebox.beat : 0;
  const sets = medleysWith(tune);

  const status = jukebox.loading
    ? "loading the band…"
    : playing
      ? `${positionText(tune, beat)}${beat < 0 ? "" : ` · ${ordinal(jukebox.timeThrough)} time`}`
      : "tap to hear it, four potatoes in front";

  return (
    <div className="tune-panel" data-testid="tune-panel" data-slug={tune.slug} data-band={band.id}>
      <header className="tune-page-head flex flex-col gap-0.5">
        <h1>{tune.title}</h1>
        <p>
          A {tune.type} in {keyName(tune.key)}, at {String(tune.defaultBpm)} beats a minute. Written
          for {own.label}: {describeBand(own.arrangement)}.
          {pageLink ? (
            <>
              {" "}
              <a href={`#/tunes/${tune.slug}`} data-testid="tune-page-link" data-slug={tune.slug}>
                Its own page &rarr;
              </a>
            </>
          ) : null}
        </p>
      </header>

      <div className="tune-page-player">
        <SpeakerButton
          playing={playing}
          onToggle={() => void jukebox.toggle(played)}
          testId="tune-play"
          label={playing ? `Stop ${tune.title}` : `Play ${tune.title}`}
        />
        <span className="tune-page-status" data-testid="tune-page-status">
          {status}
          {playing && jukebox.next !== null ? (
            <span className="tune-page-next" data-testid="tune-page-next">
              {" "}
              &middot; then {jukebox.next.title}
            </span>
          ) : null}
        </span>
      </div>
      {jukebox.error === null ? null : (
        <p className="text-xs" data-testid="tune-page-error">
          The band could not start: <code>{jukebox.error}</code>
        </p>
      )}

      <div className="tune-page-paper" data-testid="tune-notation">
        <Notation tune={played} beat={Math.max(0, beat)} showTitle={false} />
      </div>

      <section className="flex flex-col gap-1" data-testid="tune-page-bands">
        <h2>The band</h2>
        <div className="tune-bands" role="group" aria-label="Band">
          {NAMED_BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              data-testid={`tune-band-${b.id}`}
              aria-pressed={b.id === band.id}
              title={describeBand(b.arrangement)}
              onClick={() => onBand(b)}
            >
              {b.label}
              {b.id === own.id ? " (as written)" : ""}
            </button>
          ))}
        </div>
        <p className="tune-page-note">
          {describeBand(band.arrangement)}. The same setting, played by whichever band is picked;
          the potatoes follow the band&rsquo;s loudest voice, so a banjo band plucks them and a
          piano band strikes them.
        </p>
      </section>

      <section className="flex flex-col gap-1" data-testid="tune-page-chart">
        <h2>The chords</h2>
        <ChordTable tune={tune} beat={playing ? beat : null} />
      </section>

      <section className="flex flex-col gap-1" data-testid="tune-page-about">
        <h2>About</h2>
        {tune.about === undefined ? null : <p className="tune-page-prose">{tune.about}</p>}
        <p className="tune-page-note">
          This setting was typed from memory rather than copied from anywhere, so it is one
          player&rsquo;s version of the tune. To read about the tune itself:
        </p>
        <ul className="tune-page-refs">
          {(tune.references ?? []).map((ref) => (
            <li key={ref.url}>
              <a href={ref.url} target="_blank" rel="noopener noreferrer" data-testid="tune-ref">
                {ref.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1" data-testid="tune-page-sets">
        <h2>Appears in</h2>
        {sets.length === 0 ? (
          <p className="tune-page-note">No set plays this tune yet.</p>
        ) : (
          <ul className="tune-page-sets">
            {sets.map((set) => (
              <li key={set.slug}>
                <span className="tune-page-set-name">{set.slug}</span>
                <span className="tune-page-note">
                  {" "}
                  &middot; {set.tunes.map((t) => t.title).join(", ")},{" "}
                  {String(set.timesThroughEach)}&times; each &middot;{" "}
                </span>
                <a href={`#/?tune=${set.slug}`} data-testid="tune-set-link" data-set={set.slug}>
                  dance to it on the Stage &rarr;
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The hand chart as a 4 × 8 table, one phrase a row, the bar under the music lit. */
function ChordTable({ tune, beat }: { tune: Tune; beat: number | null }): JSX.Element {
  const current = beat === null || beat < 0 ? null : barAt(tune, beat);
  return (
    <table className="tune-chart">
      <tbody>
        {tune.chords.map((line, li) => (
          <tr key={li}>
            <th scope="row">{PHRASE_NAMES[li]}</th>
            {line.map((bar, bi) => {
              const [first, second] = chordPair(bar);
              const index = li * tune.meter.barsPerPhrase + bi;
              return (
                <td
                  key={bi}
                  className={index === current ? "tune-chart-current" : undefined}
                  data-bar={index}
                >
                  {first === second ? first : `${first} / ${second}`}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The bundled tunes of one type, in the bundle's own order. */
function byType(type: Tune["type"]): Tune[] {
  return tunes.filter((tune) => tune.type === type);
}

/** The medleys a tune is in, in the order `medleys` lists them. */
export function medleysWith(tune: Tune): Medley[] {
  return medleys.filter((set) => set.tunes.some((t) => t.slug === tune.slug));
}

/** "1st", "2nd", "3rd", "4th" — the times through are small numbers. */
function ordinal(n: number): string {
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${String(n)}${suffix}`;
}

/**
 * Keep the address bar on the tune and the band that are playing, without a
 * reload and without a `hashchange` — a hash change would remount the page
 * and stop the music. `undefined` clears a key: no `?band=` already means
 * the tune's own band.
 */
function setQuery(updates: Record<string, string | undefined>): void {
  const raw = window.location.hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = new URLSearchParams(q < 0 ? "" : raw.slice(q + 1));
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) query.delete(key);
    else query.set(key, value);
  }
  const rest = query.toString();
  window.history.replaceState(null, "", `#${path}${rest.length === 0 ? "" : `?${rest}`}`);
}
