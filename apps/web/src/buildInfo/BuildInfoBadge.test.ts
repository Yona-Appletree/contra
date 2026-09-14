import { describe, expect, it } from "vitest";
import {
  builtAt,
  commitDisplay,
  commitUrl,
  prUrl,
  repoSlug,
  repoUrl,
  type VersionInfo,
} from "./BuildInfoBadge.js";

// The badge's pure parts. What the panel LOOKS like open is a screenshot
// (`e2e/screenshots/v1-badge-*.png`) and what it DOES is a Playwright case
// (`e2e/badge.spec.ts`).

describe("the build-info badge's readings", () => {
  it("shortens a commit sha and marks a dirty tree", () => {
    expect(commitDisplay({ sha: "0123456789abcdef", dirty: true })).toBe("01234567 (dirty)");
    expect(commitDisplay({ sha: "0123456789abcdef", dirty: false })).toBe("01234567");
    expect(commitDisplay({})).toBe("—");
    expect(commitDisplay(undefined)).toBe("—");
  });

  it("links a commit only when there is a sha to link", () => {
    expect(commitUrl("acme/widgets", { sha: "0123456789abcdef" })).toBe(
      "https://github.com/acme/widgets/commit/0123456789abcdef",
    );
    expect(commitUrl("acme/widgets", {})).toBeUndefined();
  });

  it("falls back to this repository when no deploy named one", () => {
    expect(repoSlug(undefined)).toBe("Yona-Appletree/contra");
    expect(repoSlug({})).toBe("Yona-Appletree/contra");
    const deployed: VersionInfo = { source: { repository: "acme/widgets" } };
    expect(repoSlug(deployed)).toBe("acme/widgets");
  });

  it("builds the GitHub links", () => {
    expect(repoUrl("acme/widgets")).toBe("https://github.com/acme/widgets");
    expect(prUrl("acme/widgets", 34)).toBe("https://github.com/acme/widgets/pull/34");
  });

  it("reads a build time to the minute, in UTC", () => {
    expect(builtAt("2026-09-14T22:55:27.652Z")).toBe("2026-09-14 22:55 UTC");
    expect(builtAt(undefined)).toBe("—");
    // Schema drift degrades the row rather than blanking the panel.
    expect(builtAt("some time yesterday")).toBe("some time yesterday");
  });
});
