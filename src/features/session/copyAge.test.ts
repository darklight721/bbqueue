import { describe, expect, it } from "vite-plus/test";
import { copyNote, formatAge, STALE_AFTER_MS } from "./copyAge.ts";

describe("formatAge", () => {
  it("says how long ago in plain words", () => {
    expect(formatAge(0)).toBe("just now");
    expect(formatAge(59_000)).toBe("just now");
    expect(formatAge(60_000)).toBe("1 min ago");
    expect(formatAge(5 * 60_000 + 30_000)).toBe("5 min ago");
    expect(formatAge(60 * 60_000)).toBe("1 h ago");
    expect(formatAge(65 * 60_000)).toBe("1 h 5 min ago");
    expect(formatAge(2 * 24 * 3_600_000)).toBe("2 d ago");
  });

  it("treats a clock that runs behind the server as just now", () => {
    expect(formatAge(-90_000)).toBe("just now");
  });
});

describe("copyNote", () => {
  const updatedAt = 1_000_000;

  it("says nothing about a fresh copy while online", () => {
    expect(copyNote({ updatedAt, now: updatedAt + 30_000, online: true })).toBeNull();
    expect(copyNote({ updatedAt, now: updatedAt + 30_000, online: null })).toBeNull();
  });

  it("gives the age of an older copy while online", () => {
    expect(copyNote({ updatedAt, now: updatedAt + STALE_AFTER_MS + 60_000, online: true })).toEqual(
      {
        offline: false,
        text: "Updated 3 min ago.",
      },
    );
  });

  it("always gives the age while offline", () => {
    expect(copyNote({ updatedAt, now: updatedAt + 10_000, online: false })).toEqual({
      offline: true,
      text: "You're offline. Showing the last copy, updated just now.",
    });
  });
});
