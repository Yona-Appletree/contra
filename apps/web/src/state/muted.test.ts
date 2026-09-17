import { describe, expect, it } from "vitest";
import { MUTED_KEY, readMuted, writeMuted } from "./muted.js";

/** A `Storage` that only holds what it was given — enough for the two readers. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key),
    setItem: (key: string, value: string) => map.set(key, value),
  } as Storage;
}

/** A `Storage` that throws on everything, as a private window's can. */
const hostileStorage = (): Storage =>
  ({
    getItem: () => {
      throw new Error("nope");
    },
    setItem: () => {
      throw new Error("nope");
    },
  }) as unknown as Storage;

describe("readMuted (AC4)", () => {
  it("defaults to unmuted when nothing is stored", () => {
    expect(readMuted(fakeStorage())).toBe(false);
  });

  it("reads the flag back", () => {
    expect(readMuted(fakeStorage({ [MUTED_KEY]: "true" }))).toBe(true);
    expect(readMuted(fakeStorage({ [MUTED_KEY]: "false" }))).toBe(false);
  });

  it("treats anything but the exact word as unmuted", () => {
    expect(readMuted(fakeStorage({ [MUTED_KEY]: "1" }))).toBe(false);
    expect(readMuted(fakeStorage({ [MUTED_KEY]: "TRUE" }))).toBe(false);
  });

  it("is unmuted with no storage at all, and when storage throws", () => {
    expect(readMuted(undefined)).toBe(false);
    expect(readMuted(hostileStorage())).toBe(false);
  });
});

describe("writeMuted (AC4)", () => {
  it("round-trips through the same key", () => {
    const storage = fakeStorage();
    writeMuted(true, storage);
    expect(storage.getItem(MUTED_KEY)).toBe("true");
    expect(readMuted(storage)).toBe(true);

    writeMuted(false, storage);
    expect(storage.getItem(MUTED_KEY)).toBe("false");
    expect(readMuted(storage)).toBe(false);
  });

  it("touches nothing else", () => {
    const storage = fakeStorage({ "hall:something-else": "kept" });
    writeMuted(true, storage);
    expect(storage.getItem("hall:something-else")).toBe("kept");
    expect(storage.length).toBe(2);
  });

  it("never throws", () => {
    expect(() => writeMuted(true, undefined)).not.toThrow();
    expect(() => writeMuted(true, hostileStorage())).not.toThrow();
  });
});
