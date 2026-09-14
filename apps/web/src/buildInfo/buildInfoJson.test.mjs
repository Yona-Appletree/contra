import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The deploy metadata writer, against a fake git repository.
 *
 * `scripts/pages/build-info.mjs` is root-level tooling, outside every
 * workspace package, so `turbo run test` cannot reach a test beside it. It
 * lives here instead, in the app whose `dist/` the script writes into and
 * whose badge reads the two files back. It is a `.mjs` test, like the script
 * it tests: `apps/web` has no `@types/node`, and a plain Node script's test
 * has no business asking for one.
 *
 * The script runs as a subprocess — the way the deploy runs it — against a
 * throwaway repository carrying the tag and commit shapes this repo actually
 * produces.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const script = path.join(repoRoot, "scripts/pages/build-info.mjs");
const workspaces = [];

afterAll(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway git repository, with a commit and (usually) a tag per entry. */
function fakeRepo(commits) {
  const dir = mkdtempSync(path.join(tmpdir(), "contra-build-info-"));
  workspaces.push(dir);
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  for (const { subject, body, tag } of commits) {
    const message = body === undefined ? [subject] : [subject, body];
    git("commit", "--quiet", "--allow-empty", ...message.flatMap((part) => ["-m", part]));
    if (tag) git("tag", "-a", tag, "-m", tag);
  }
  return dir;
}

/** Run the writer against `repo`, and read back the two files it wrote. */
function run(repo, env = {}) {
  const out = path.join(repo, "dist");
  execFileSync("node", [script, "--out", out, "--repo", repo, "--channel", "test"], {
    // A scrubbed environment: APP_VERSION and GITHUB_* from whatever ran the
    // suite would otherwise decide the answer instead of the fake repo.
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdio: ["ignore", "pipe", "ignore"],
  });
  return {
    version: JSON.parse(readFileSync(path.join(out, "version.json"), "utf8")),
    changelog: JSON.parse(readFileSync(path.join(out, "changelog.json"), "utf8")),
  };
}

describe("scripts/pages/build-info.mjs", () => {
  it("writes the deployed artifact's identity", () => {
    const repo = fakeRepo([{ subject: "A first change (#1)", tag: "v2026.09.14-1" }]);
    const { version } = run(repo, {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "Yona-Appletree/contra",
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
      GITHUB_WORKFLOW: "Main push",
      GITHUB_RUN_ID: "77",
      GITHUB_RUN_ATTEMPT: "1",
      APP_VERSION: "v2026.09.14-1",
    });

    expect(version).toMatchObject({
      schemaVersion: 1,
      app: "contra",
      channel: "test",
      version: "v2026.09.14-1",
      source: {
        repository: "Yona-Appletree/contra",
        ref: "main",
        sha: "0123456789abcdef0123456789abcdef01234567",
        dirty: false,
      },
      build: { workflow: "Main push", runId: "77", runAttempt: "1" },
    });
    expect(version.build.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to the checkout's own git when there is no workflow", () => {
    const repo = fakeRepo([{ subject: "A first change (#1)", tag: "v2026.09.14-1" }]);
    const { version } = run(repo);
    expect(version.version).toBe("v2026.09.14-1");
    expect(version.source.ref).toBe("main");
    expect(version.source.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(version.source.repository).toBe("Yona-Appletree/contra");
    expect(version.source.dirty).toBe(false);
  });

  it("names the pull request from a squash-merge subject, newest first", () => {
    const repo = fakeRepo([
      { subject: "The scaffold (#1)", tag: "v2026.09.13-1" },
      { subject: "Traces from the simulation (#34)", tag: "v2026.09.14-1" },
      { subject: "A hand-made commit with no pull request", tag: "v2026.09.14-2" },
    ]);
    const { changelog } = run(repo);

    expect(changelog.schemaVersion).toBe(1);
    expect(changelog.entries).toHaveLength(3);
    expect(changelog.entries[0]).toMatchObject({
      version: "v2026.09.14-2",
      summary: "A hand-made commit with no pull request",
      pr: null,
    });
    expect(changelog.entries[1]).toMatchObject({
      version: "v2026.09.14-1",
      // The `(#34)` names the pull request; it is not repeated in the text.
      summary: "Traces from the simulation",
      pr: 34,
    });
    expect(changelog.entries[1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(changelog.entries[2]).toMatchObject({ version: "v2026.09.13-1", pr: 1 });
  });

  it("still reads a GitHub merge commit, whose title is in the body", () => {
    const repo = fakeRepo([
      {
        subject: "Merge pull request #7 from Yona-Appletree/some-branch",
        body: "The hall after dark",
        tag: "v2026.09.12-1",
      },
    ]);
    const { changelog } = run(repo);
    expect(changelog.entries[0]).toMatchObject({ summary: "The hall after dark", pr: 7 });
  });

  it("ignores tags that are not version tags", () => {
    const repo = fakeRepo([
      { subject: "A release (#2)", tag: "v2026.09.14-1" },
      { subject: "Something else (#3)", tag: "v1.2.3" },
    ]);
    const { changelog } = run(repo);
    expect(changelog.entries).toHaveLength(1);
    expect(changelog.entries[0].version).toBe("v2026.09.14-1");
  });

  it("keeps the twenty most recent tags", () => {
    const repo = fakeRepo(
      Array.from({ length: 25 }, (_, index) => ({
        subject: `Change ${index + 1} (#${index + 1})`,
        tag: `v2026.09.14-${index + 1}`,
      })),
    );
    const { changelog } = run(repo);
    expect(changelog.entries).toHaveLength(20);
    expect(changelog.entries[0].version).toBe("v2026.09.14-25");
  });

  it("yields an empty changelog on a tagless tree rather than failing the deploy", () => {
    const repo = fakeRepo([{ subject: "Untagged" }]);
    const { version, changelog } = run(repo);
    expect(changelog.entries).toEqual([]);
    expect(version.version).toBe("dev");
  });

  it("refuses to run without an output directory", () => {
    expect(() =>
      execFileSync("node", [script], { stdio: ["ignore", "pipe", "pipe"] }),
    ).toThrowError();
  });
});
