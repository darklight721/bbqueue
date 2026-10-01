import { describe, expect, it } from "vite-plus/test";
import {
  gamesEach,
  suggestPointSystem,
  suggestPointSystemForTimeLeft,
  validateScore,
} from "./scoring.ts";

describe("validateScore", () => {
  it("accepts a winner at or above the target", () => {
    expect(validateScore([21, 0], 21)).toBeNull();
    expect(validateScore([15, 22], 21)).toBeNull();
    expect(validateScore([31, 29], 31)).toBeNull();
  });

  it("rejects non-integers, negatives, ties and sub-target scores", () => {
    expect(validateScore([21.5, 3], 21)).toBe("not-integer");
    expect(validateScore([Number.NaN, 3], 21)).toBe("not-integer");
    expect(validateScore([-1, 21], 21)).toBe("negative");
    expect(validateScore([21, 21], 21)).toBe("tied");
    expect(validateScore([0, 0], 21)).toBe("tied");
    expect(validateScore([20, 10], 21)).toBe("below-target");
    expect(validateScore([21, 15], 31)).toBe("below-target");
  });
});

describe("suggestPointSystem", () => {
  it("returns null under 4 players", () => {
    expect(suggestPointSystem({ players: 3, courts: 1, hours: 2 })).toBeNull();
    expect(suggestPointSystem({ players: 0, courts: 1, hours: 2 })).toBeNull();
  });

  it("suggests 31 at exactly 3 games each (30-minute matches)", () => {
    // 1 court × 1.5 h × 4 players: 3 matches of 30 min → 3 games each.
    expect(gamesEach({ players: 4, courts: 1, hours: 1.5 }, 30)).toBe(3);
    expect(suggestPointSystem({ players: 4, courts: 1, hours: 1.5 })).toEqual({
      pointSystem: 31,
      gamesEach: 3,
    });
  });

  it("suggests 21 just below 3 games each, reporting games at 15 minutes", () => {
    expect(suggestPointSystem({ players: 5, courts: 1, hours: 1.5 })).toEqual({
      pointSystem: 21,
      gamesEach: 5,
    });
    expect(suggestPointSystem({ players: 4, courts: 1, hours: 1 })).toEqual({
      pointSystem: 21,
      gamesEach: 4,
    });
  });

  it("scales with courts and hours", () => {
    expect(suggestPointSystem({ players: 12, courts: 2, hours: 2 })?.pointSystem).toBe(21);
    expect(suggestPointSystem({ players: 12, courts: 2, hours: 3 })).toEqual({
      pointSystem: 31,
      gamesEach: 4,
    });
    expect(suggestPointSystem({ players: 8, courts: 2, hours: 1.5 })).toEqual({
      pointSystem: 31,
      gamesEach: 3,
    });
  });
});

describe("suggestPointSystemForTimeLeft", () => {
  const HOUR = 3_600_000;
  const base = { players: 4, courts: 1, plannedHours: 2, startedAt: 0 };

  it("uses the hours left (planned − elapsed)", () => {
    // 0.5 h elapsed of 2 h → 1.5 h left → 3 more games each at 30 min.
    expect(suggestPointSystemForTimeLeft({ ...base, now: 0.5 * HOUR })).toEqual({
      pointSystem: 31,
      gamesEach: 3,
    });
    // 1 h elapsed → 1 h left → 21, 4 more games each.
    expect(suggestPointSystemForTimeLeft({ ...base, now: HOUR })).toEqual({
      pointSystem: 21,
      gamesEach: 4,
    });
  });

  it("is null when time is up, over, or under 4 players", () => {
    expect(suggestPointSystemForTimeLeft({ ...base, now: 2 * HOUR })).toBeNull();
    expect(suggestPointSystemForTimeLeft({ ...base, now: 3 * HOUR })).toBeNull();
    expect(suggestPointSystemForTimeLeft({ ...base, players: 3, now: 0 })).toBeNull();
  });
});
