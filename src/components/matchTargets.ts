import type { PointSystem } from "../domain/types.ts";

/** True when the matches were played to more than one Target (so each match row shows it). */
export function usesMixedTargets(matches: readonly { target: PointSystem }[]): boolean {
  return new Set(matches.map((match) => match.target)).size > 1;
}
