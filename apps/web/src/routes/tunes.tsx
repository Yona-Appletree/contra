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
import { useCallback, useMemo, useState } from "react";
import { SpeakerButton } from "../SpeakerButton.js";
import { useTunePlayer } from "../tunePlayer.js";
import { PHRASE_NAMES, barAt, keyName, positionText } from "../tuneText.js";

/**
 * The Tunes tab (F4): one paper card per bundled tune, reels then jigs, each
 * with a play button — the user: "a music player page where you can just
 * hear each tune, see the music, info about it, link to source".
 *
 * One player for the page, so pressing another card's button switches
 * rather than stacking two tunes. The card is the note-card idiom the Dances
 * tab uses, with the tune's facts where the dance card has its phrases; the
 * notation, the chart and the rest are on the tune's own page, a tap away.
 */
export function TunesPage(): JSX.Element {
  const playback = useTunePlayer();
  const groups = useMemo(
    () =>
      (["reel", "jig"] as const).map((type) => ({
        type,
        title: type === "reel" ? "Reels" : "Jigs",
        tunes: tunes.filter((tune) => tune.type === type),
      })),
    [],
  );

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4"
      data-testid="tunes-page"
    >
      <p className="text-sm text-muted-foreground">
        The band&rsquo;s book: every tune the Stage plays, with four potatoes in front. Tap the
        speaker to hear one, or open a tune&rsquo;s page for the music, the chords and the band.
      </p>
      {playback.error === null ? null : (
        <p className="text-xs" data-testid="tunes-error">
          The band could not start: <code>{playback.error}</code>
        </p>
      )}

      {groups.map((group) => (
        <section key={group.type} className="flex flex-col gap-2" data-testid="tunes-group">
          <h2 className="tunes-group-title">{group.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tunes.map((tune) => (
              <TuneCard
                key={tune.slug}
                tune={tune}
                playing={playback.tune?.slug === tune.slug}
                loading={playback.loading && playback.tune?.slug !== tune.slug}
                onToggle={() => void playback.toggle(tune)}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

/** One tune's card: its title (a link to its page), its facts, and its play button. */
function TuneCard({
  tune,
  playing,
  loading,
  onToggle,
}: {
  tune: Tune;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
}): JSX.Element {
  const band = bandOf(tune);
  const sets = medleysWith(tune);
  return (
    <article
      className="tune-card"
      data-testid="tune-card"
      data-slug={tune.slug}
      data-playing={playing}
    >
      <div className="tune-card-head">
        <a
          href={`#/tunes/${tune.slug}`}
          className="tune-card-title"
          data-testid="tune-card-link"
          data-slug={tune.slug}
        >
          {tune.title}
        </a>
        <span className="tune-card-meta">
          {tune.type} in {keyName(tune.key)} &middot; {String(tune.defaultBpm)} bpm
        </span>
      </div>
      <div className="tune-card-body">
        <div className="tune-card-lines">
          <span>
            {band === undefined ? "its own band" : band.label}: {describeBand(tune.arrangement)}
          </span>
          <span className="tune-card-dim">
            {sets.length === 0 ? "in no set" : `in ${sets.map((set) => set.slug).join(", ")}`}
          </span>
        </div>
        <SpeakerButton
          playing={playing}
          onToggle={onToggle}
          testId="tune-play"
          label={loading ? "Loading" : playing ? `Stop ${tune.title}` : `Play ${tune.title}`}
        />
      </div>
    </article>
  );
}

/**
 * `#/tunes/<slug>`: one tune's own page — the notation with the bar cursor
 * following the music, the band switcher, the chord chart, a paragraph about
 * the tune with links to read more, and the sets it is in.
 *
 * **The band switcher** is the listening check the per-tune-arrangement plan
 * owed: the same setting played by each of the four bands, switched without
 * losing the beat (`useTunePlayer` keeps it for a tune that is already
 * playing). `?band=<id>` on the URL makes a listen linkable; the page writes
 * it with `replaceState`, as the Stage writes its dance, so switching does
 * not remount the page and stop the tune.
 *
 * **The references are about the tune, not the source of this setting.** The
 * settings were typed from memory (each tune file's own provenance comment
 * says how confidently), so the page says so once and links to where the
 * tune itself can be read about — never to a transcription it did not copy.
 */
export function TunePage({ slug, params }: { slug: string; params: URLSearchParams }): JSX.Element {
  const tune = tunes.find((t) => t.slug === slug);
  if (tune === undefined) {
    return (
      <main className="p-6">
        <p data-testid="tune-page-missing">
          No tune called <code>{slug}</code>. <a href="#/tunes">Back to the book</a>.
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
  const played = useMemo(() => rearrange(tune, band.arrangement), [tune, band]);
  const playback = useTunePlayer();
  const playing = playback.tune?.slug === tune.slug;
  const beat = playing ? playback.beat : 0;
  const sets = medleysWith(tune);

  const pickBand = useCallback(
    (next: NamedBand): void => {
      setBand(next);
      setBandUrl(next.id === own.id ? undefined : next.id);
      if (playing) void playback.play(rearrange(tune, next.arrangement));
    },
    [own.id, playing, playback, tune],
  );

  const status = playback.loading
    ? "loading the band…"
    : playing
      ? positionText(tune, beat)
      : "tap to hear it, four potatoes in front";

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 lg:p-4"
      data-testid="tune-page"
      data-slug={tune.slug}
      data-band={band.id}
      data-playing={playing}
      data-beat={playing ? String(beat) : undefined}
    >
      <a href="#/tunes" className="text-sm" data-testid="tune-page-back">
        &larr; All the tunes
      </a>

      <div className="tune-page">
        <header className="tune-page-head flex flex-col gap-0.5">
          <h1>{tune.title}</h1>
          <p>
            A {tune.type} in {keyName(tune.key)}, at {String(tune.defaultBpm)} beats a minute.
            Written for {own.label}: {describeBand(own.arrangement)}.
          </p>
        </header>

        <div className="tune-page-player">
          <SpeakerButton
            playing={playing}
            onToggle={() => void playback.toggle(played)}
            testId="tune-play"
            label={playing ? `Stop ${tune.title}` : `Play ${tune.title}`}
          />
          <span className="tune-page-status" data-testid="tune-page-status">
            {status}
          </span>
        </div>
        {playback.error === null ? null : (
          <p className="text-xs" data-testid="tune-page-error">
            The band could not start: <code>{playback.error}</code>
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
                onClick={() => pickBand(b)}
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
                    {String(set.timesThroughEach)}
                    &times; each &middot;{" "}
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
    </main>
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

/** The medleys a tune is in, in the order `medleys` lists them. */
export function medleysWith(tune: Tune): Medley[] {
  return medleys.filter((set) => set.tunes.some((t) => t.slug === tune.slug));
}

/**
 * Keep the address bar on the band that is playing, without a reload and
 * without a `hashchange` — the page is keyed on its params, and a hash change
 * would remount it and stop the tune. `undefined` clears it: the tune's own
 * band is what a URL with no `?band=` already means.
 */
function setBandUrl(band: string | undefined): void {
  const raw = window.location.hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = new URLSearchParams(q < 0 ? "" : raw.slice(q + 1));
  query.delete("band");
  if (band !== undefined) query.set("band", band);
  const rest = query.toString();
  window.history.replaceState(null, "", `#${path}${rest.length === 0 ? "" : `?${rest}`}`);
}
