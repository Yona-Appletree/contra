import { Popover } from "@caller/ui-base";
import type { JSX } from "react";
import { useEffect, useState } from "react";

/**
 * The build-info badge at the right end of the tab bar.
 *
 * An icon-only trigger — the tab bar has no width to spend on a version
 * string, so the build's identity rides the hover title and the popover —
 * opening a panel that says which build is actually live: the version, the
 * channel, the commit (linked), the branch, when it was built, the source
 * link, and the last twenty releases with each one's pull request.
 *
 * The two files it reads are written into the deployed artifact by
 * `scripts/pages/build-info.mjs` on every Pages deploy. A local dev build
 * emits neither, so both fetches 404 and the badge says "dev build" rather
 * than claiming a version it cannot know. They are fetched independently: a
 * missing changelog must never blank the current build's details.
 *
 * Ported, design and all, from lightplayer's
 * `lp-app/lpa-studio-web/src/app/layout/version_badge.rs`.
 */
export function BuildInfoBadge(): JSX.Element {
  const [version, setVersion] = useState<Fetched<VersionInfo>>({ state: "loading" });
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    let live = true;
    void fetchJson<VersionInfo>("version.json").then((info) => {
      if (live) setVersion(info ? { state: "loaded", info } : { state: "unavailable" });
    });
    void fetchJson<Changelog>("changelog.json").then((log) => {
      if (live && log?.entries) setChangelog(log.entries);
    });
    return () => {
      live = false;
    };
  }, []);

  const info = version.state === "loaded" ? version.info : undefined;
  const title = `Build info — ${
    version.state === "loading" ? "…" : (info?.version ?? "dev build")
  }`;

  return (
    <Popover
      label="Build info"
      title={title}
      placement="bottom-end"
      triggerTestId="build-info-trigger"
      panelTestId="build-info-panel"
      className="flex size-7 flex-none items-center justify-center rounded-full border border-border bg-transparent p-0 text-muted-foreground hover:text-foreground"
      openClassName="flex size-7 flex-none items-center justify-center rounded-full border border-transparent bg-transparent p-0 text-foreground"
      trigger={info ? <TagIcon /> : <BranchIcon />}
      panelClassName="grid max-h-[min(70vh,34rem)] w-[min(20rem,calc(100vw-1.5rem))] gap-3 overflow-y-auto overscroll-contain rounded-md p-3 text-xs text-secondary-foreground"
    >
      <BuildInfoPanel info={info} loading={version.state === "loading"} changelog={changelog} />
    </Popover>
  );
}

/**
 * The panel's contents, as a pure function of what was fetched — so a story
 * can render every state without a network.
 */
export function BuildInfoPanel({
  info,
  loading = false,
  changelog = [],
}: {
  info?: VersionInfo;
  loading?: boolean;
  changelog?: ChangelogEntry[];
}): JSX.Element {
  const repo = repoSlug(info);
  return (
    <>
      <div className="grid min-w-0 gap-0.5">
        <strong className="text-sm text-foreground">Build info</strong>
        <span className="text-[0.68rem] text-muted-foreground">
          {loading ? "Reading the deployed artifact…" : "From the deployed artifact"}
        </span>
      </div>

      {info ? (
        <dl className="m-0 grid min-w-0 gap-2">
          <Row label="version" value={info.version ?? "unknown"} />
          <Row label="channel" value={info.channel ?? "—"} />
          <Row
            label="commit"
            value={commitDisplay(info.source)}
            href={commitUrl(repo, info.source)}
          />
          <Row label="branch" value={info.source?.ref ?? "—"} />
          <Row label="built" value={builtAt(info.build?.generatedAt)} />
        </dl>
      ) : (
        <p className="m-0 text-muted-foreground">
          {loading ? "…" : "Dev build — version metadata is only written into deployed builds."}
        </p>
      )}

      {changelog.length > 0 ? (
        <section className="grid min-w-0 gap-1.5 border-t border-border pt-2.5">
          <span className="text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">
            Recent updates
          </span>
          <ul className="m-0 grid min-w-0 list-none gap-1.5 p-0">
            {changelog.map((entry) => (
              <li key={entry.version ?? entry.summary} className="grid min-w-0 gap-0.5">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-[0.7rem] font-semibold text-foreground">
                    {entry.version ?? "unknown"}
                  </span>
                  {entry.date ? (
                    <span className="text-[0.68rem] text-muted-foreground">{entry.date}</span>
                  ) : null}
                  {entry.pr ? (
                    <a
                      className="ml-auto shrink-0 self-center font-mono text-[0.68rem] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                      href={prUrl(repo, entry.pr)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{entry.pr}
                    </a>
                  ) : null}
                </div>
                {entry.summary ? (
                  <span className="min-w-0 break-words text-muted-foreground">{entry.summary}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="grid min-w-0 gap-1.5 border-t border-border pt-2.5">
        <a
          className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground"
          href={repoUrl(repo)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BranchIcon />
          <span>Source on GitHub</span>
          <span className="min-w-0 truncate font-mono text-[0.68rem] opacity-70">{repo}</span>
        </a>
        <span className="text-[0.68rem] text-muted-foreground">
          © {COPYRIGHT_YEAR} {AUTHOR} · AGPL-3.0-or-later
        </span>
      </footer>
    </>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }): JSX.Element {
  return (
    <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="m-0 min-w-0 break-words font-mono text-[0.7rem]">
        {href ? (
          <a
            className="text-inherit underline decoration-dotted underline-offset-2 hover:text-foreground"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/** Who wrote it, for the panel's attribution line. */
const AUTHOR = "Yona Appletree";
const COPYRIGHT_YEAR = "2026";
/** Used for links when no `version.json` was fetched, so a dev build still links home. */
const DEFAULT_REPOSITORY = "Yona-Appletree/contra";

/**
 * The part of the deploy's `version.json` the badge renders. Every field is
 * optional: this is parsed from a file on a server, and schema drift must
 * degrade a row, never blank the panel.
 */
export interface VersionInfo {
  version?: string;
  channel?: string;
  source?: VersionSource;
  build?: { generatedAt?: string };
}

export interface VersionSource {
  sha?: string;
  dirty?: boolean;
  ref?: string;
  /** GitHub `owner/name`, which every link here is built from. */
  repository?: string;
}

export interface Changelog {
  entries?: ChangelogEntry[];
}

/** One "Recent updates" row: a single version tag, best-effort summarised. */
export interface ChangelogEntry {
  version?: string;
  date?: string;
  summary?: string;
  pr?: number | null;
}

type Fetched<T> = { state: "loading" } | { state: "loaded"; info: T } | { state: "unavailable" };

/** The GitHub slug for this build, falling back so links always resolve. */
export function repoSlug(info?: VersionInfo): string {
  const repo = info?.source?.repository;
  return repo && repo.length > 0 ? repo : DEFAULT_REPOSITORY;
}

export const repoUrl = (repo: string): string => `https://github.com/${repo}`;
export const prUrl = (repo: string, pr: number): string =>
  `https://github.com/${repo}/pull/${String(pr)}`;

/** The exact commit on GitHub, or nothing — a row with no sha is not a link. */
export function commitUrl(repo: string, source?: VersionSource): string | undefined {
  const sha = source?.sha;
  return sha && sha.length > 0 ? `https://github.com/${repo}/commit/${sha}` : undefined;
}

/** Short sha, marked when the deploy was built from a dirty tree. */
export function commitDisplay(source?: VersionSource): string {
  const sha = source?.sha;
  if (!sha || sha.length === 0) return "—";
  const short = sha.slice(0, 8);
  return source?.dirty === true ? `${short} (dirty)` : short;
}

/** An ISO build time as a readable UTC stamp; anything unparseable passes through. */
export function builtAt(generatedAt?: string): string {
  if (!generatedAt) return "—";
  const at = new Date(generatedAt);
  if (Number.isNaN(at.getTime())) return generatedAt;
  return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Same-origin static JSON, under the app's own base path (the site is served
 * from `/contra/`, so a root-absolute `/version.json` would miss). Any
 * failure — the 404 of a dev build, a network error, a parse error —
 * resolves to `undefined` and the caller degrades.
 */
async function fetchJson<T>(name: string): Promise<T | undefined> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${name}`, { cache: "no-cache" });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

/** A luggage tag: a deployed, tagged release. */
function TagIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.2 1.5H14.5V7.8L8 14.3 1.7 8Z" />
      <circle cx="11.2" cy="4.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A branch: a build with no deploy metadata, and the source link's mark. */
function BranchIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 3.8v8.4M4.5 7.5h4a3 3 0 0 0 3-3" />
      <circle cx="4.5" cy="2.4" r="1.4" />
      <circle cx="4.5" cy="13.6" r="1.4" />
      <circle cx="11.5" cy="3.1" r="1.4" />
    </svg>
  );
}
