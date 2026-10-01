import { validateScore, type ScoreError } from "../../../domain/engine/index.ts";
import type { PointSystem } from "../../../domain/types.ts";

export type ScoreProblem = ScoreError | "missing";

export function scoreMessage(problem: ScoreProblem, pointSystem: PointSystem): string {
  switch (problem) {
    case "missing":
      return "Enter both scores, or end without a score.";
    case "not-integer":
      return "Scores must be whole numbers.";
    case "negative":
      return "Scores can't be negative.";
    case "tied":
      return "Scores can't be level. One team has to win.";
    case "below-target":
      return `The winning team needs at least ${pointSystem} points.`;
  }
}

/** Parse the two fields and check them; null when the score is good. */
export function checkScore(
  raw: [string, string],
  pointSystem: PointSystem,
): { problem: ScoreProblem; score: null } | { problem: null; score: [number, number] } {
  if (raw[0].trim() === "" || raw[1].trim() === "") return { problem: "missing", score: null };
  const score: [number, number] = [Number(raw[0].trim()), Number(raw[1].trim())];
  if (score.some((value) => Number.isNaN(value))) return { problem: "not-integer", score: null };
  const problem = validateScore(score, pointSystem);
  return problem ? { problem, score: null } : { problem: null, score };
}
