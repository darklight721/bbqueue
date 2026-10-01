import type { PointSystemSuggestion } from "../../domain/engine/index.ts";
import type { Session } from "../../domain/types.ts";

/** "Matches being played stay at 21 points." — null when no court is playing. */
export function playingLine(session: Session): string | null {
  const active = session.matches
    .filter((match) => match.status === "active")
    .sort((a, b) => a.courtNumber - b.courtNumber);
  if (active.length === 0) return null;
  const targets = new Set(active.map((match) => match.target));
  if (targets.size === 1) {
    const [target] = targets;
    return active.length === 1
      ? `The match being played stays at ${target} points.`
      : `Matches being played stay at ${target} points.`;
  }
  const perCourt = active.map((match) => `court ${match.courtNumber} at ${match.target}`);
  return `Matches being played keep their points: ${perCourt.join(", ")}.`;
}

/** "Suggested: 21 — about 2 more games each". */
export function suggestionLine({ pointSystem, gamesEach }: PointSystemSuggestion): string {
  const games =
    gamesEach < 1
      ? "less than one more game each"
      : `about ${gamesEach} more ${gamesEach === 1 ? "game" : "games"} each`;
  return `Suggested: ${pointSystem} — ${games}`;
}
