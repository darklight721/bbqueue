import { describe, expect, it } from "vite-plus/test";
import { formatDuration } from "./clock.ts";
import { checkScore } from "./courts/score.ts";
import { messageForReason } from "./reasons.ts";

describe("formatDuration", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(-5_000)).toBe("00:00");
    expect(formatDuration(65_900)).toBe("01:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
  });
});

describe("checkScore", () => {
  it("accepts a valid score", () => {
    expect(checkScore(["21", " 17 "], 21)).toEqual({ problem: null, score: [21, 17] });
    expect(checkScore(["29", "31"], 31)).toEqual({ problem: null, score: [29, 31] });
  });

  it("reports each problem", () => {
    expect(checkScore(["", "3"], 21).problem).toBe("missing");
    expect(checkScore(["abc", "3"], 21).problem).toBe("not-integer");
    expect(checkScore(["21.5", "3"], 21).problem).toBe("not-integer");
    expect(checkScore(["-1", "21"], 21).problem).toBe("negative");
    expect(checkScore(["21", "21"], 21).problem).toBe("tied");
    expect(checkScore(["20", "18"], 21).problem).toBe("below-target");
  });
});

describe("messageForReason", () => {
  it("maps known reasons and falls back for unknown ones", () => {
    expect(messageForReason("court-busy")).toBe(
      "That court is in use. End or remove the match first.",
    );
    expect(messageForReason("something-new")).toBe("That didn't work. Please try again.");
  });
});
