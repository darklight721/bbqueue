import type { PointSystem } from "../types.ts";

export type ScoreError = "not-integer" | "negative" | "tied" | "below-target";

/** Two integers ≥ 0, not equal, the higher at least the Point system target. */
export function validateScore(
  score: readonly [number, number],
  pointSystem: PointSystem,
): ScoreError | null {
  const [a, b] = score;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return "not-integer";
  if (a < 0 || b < 0) return "negative";
  if (a === b) return "tied";
  if (Math.max(a, b) < pointSystem) return "below-target";
  return null;
}

export interface PointSystemSuggestion {
  pointSystem: PointSystem;
  /** Rounded games each player can expect, at the match length of the suggested system. */
  gamesEach: number;
}

export interface SuggestionInput {
  players: number;
  courts: number;
  hours: number;
}

/** Games per player if every Match takes `matchMinutes`. Unrounded. */
export function gamesEach(input: SuggestionInput, matchMinutes: number): number {
  return (input.courts * input.hours * 60 * 4) / (matchMinutes * input.players);
}

/** 31 points if everyone gets ≥ 3 games of ~30 min, otherwise 21 (~15 min). Null under 4 players. */
export function suggestPointSystem(input: SuggestionInput): PointSystemSuggestion | null {
  if (input.players < 4) return null;
  // Compare without dividing so exact boundaries (e.g. 3.0 games) are not lost to rounding.
  const thirtyMinuteGames = input.courts * input.hours * 60 * 4 >= 3 * 30 * input.players;
  const pointSystem: PointSystem = thirtyMinuteGames ? 31 : 21;
  return { pointSystem, gamesEach: Math.round(gamesEach(input, pointSystem === 31 ? 30 : 15)) };
}

export interface TimeLeftSuggestionInput {
  /** Current non-removed players. */
  players: number;
  /** Current number of Courts. */
  courts: number;
  plannedHours: number;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms. */
  now: number;
}

/**
 * Suggestion for the rest of the Session: hours left = plannedHours − elapsed. `gamesEach` is
 * the number of *more* games each player can expect. Null once time is up or under 4 players.
 */
export function suggestPointSystemForTimeLeft(
  input: TimeLeftSuggestionInput,
): PointSystemSuggestion | null {
  const hours = input.plannedHours - (input.now - input.startedAt) / 3_600_000;
  if (!(hours > 0)) return null;
  return suggestPointSystem({ players: input.players, courts: input.courts, hours });
}
